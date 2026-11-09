package app.mealsnap;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.BufferedOutputStream;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;

/**
 * 밥찰칵 앱 껍데기: 앱 파일(assets/www)을 https://appassets.androidplatform.net/ 가상 주소로 서빙하는 WebView 하나.
 * 이 가상 주소는 보안 컨텍스트(https)라서 카메라(getUserMedia)와 IndexedDB가 정상 동작한다.
 * 네이티브가 하는 일: 카메라 권한, 갤러리/백업 파일 선택, 백업 파일을 다운로드 폴더에 저장·공유, 뒤로가기, 상태바 색.
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final String ORIGIN = "https://" + HOST + "/";
    static final int REQ_CAMERA = 1;
    static final int REQ_FILE = 2;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest pendingCamera;

    // 백업 파일 전송 상태 (JS → 네이티브 청크 전송)
    private OutputStream exportOut;
    private File exportTmp;
    private String exportName;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        boolean dark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;

        web = new WebView(this);
        setContentView(web);
        applyBars(dark);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setLongClickable(false);
        web.setHapticFeedbackEnabled(false);
        web.addJavascriptInterface(new Bridge(), "MealsnapNative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return serve(request.getUrl());
            }

            // API 24+ 메서드. 컴파일용 android.jar(API 23)에는 없어 @Override 없이 둔다(런타임엔 호출됨).
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest req) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() { handlePermission(req); }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                return openChooser(cb, params);
            }
        });

        if (saved != null && web.restoreState(saved) != null) return;
        web.loadUrl(ORIGIN + "index.html");
    }

    /* ---------- 앱 파일 서빙 ---------- */
    private WebResourceResponse serve(Uri uri) {
        if (!HOST.equals(uri.getHost())) return null;
        String path = uri.getPath();
        if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
        try {
            InputStream in = getAssets().open("www" + path);
            return new WebResourceResponse(mimeOf(path), "utf-8", in);
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                    new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
        }
    }

    private static String mimeOf(String p) {
        String l = p.toLowerCase();
        if (l.endsWith(".html")) return "text/html";
        if (l.endsWith(".js")) return "text/javascript";
        if (l.endsWith(".css")) return "text/css";
        if (l.endsWith(".png")) return "image/png";
        if (l.endsWith(".svg")) return "image/svg+xml";
        if (l.endsWith(".webmanifest")) return "application/manifest+json";
        if (l.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    /* ---------- 카메라 권한 ---------- */
    private void handlePermission(PermissionRequest req) {
        boolean ours = req.getOrigin() != null && HOST.equals(req.getOrigin().getHost());
        boolean wantsCamera = false;
        for (String r : req.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantsCamera = true;
        }
        if (!ours || !wantsCamera) { req.deny(); return; }
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            req.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
        } else {
            if (pendingCamera != null) pendingCamera.deny();
            pendingCamera = req;
            requestPermissions(new String[] { Manifest.permission.CAMERA }, REQ_CAMERA);
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (code != REQ_CAMERA || pendingCamera == null) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            pendingCamera.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
        } else {
            pendingCamera.deny();
        }
        pendingCamera = null;
    }

    /* ---------- 파일 선택 (갤러리 가져오기, 백업 복원) ---------- */
    private boolean openChooser(ValueCallback<Uri[]> cb, WebChromeClient.FileChooserParams params) {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        fileCallback = cb;
        Intent i = new Intent(Intent.ACTION_GET_CONTENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        String type = "*/*";
        String[] accept = params.getAcceptTypes();
        boolean allImages = accept != null && accept.length > 0;
        if (accept != null) {
            for (String a : accept) {
                for (String t : a.split(",")) {
                    t = t.trim();
                    if (!t.startsWith("image/")) allImages = false;
                }
            }
        }
        if (allImages) type = "image/*";
        i.setType(type);
        if (params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
            i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }
        try {
            startActivityForResult(Intent.createChooser(i, "선택"), REQ_FILE);
            return true;
        } catch (Exception e) {
            fileCallback = null;
            cb.onReceiveValue(null);
            return false;
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_FILE || fileCallback == null) return;
        fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
        fileCallback = null;
    }

    /* ---------- JS 브리지: 백업 파일 저장/공유, 상태바 ---------- */
    private class Bridge {
        @JavascriptInterface
        public boolean beginFile(String name) {
            try {
                closeExport();
                exportName = (name == null || name.isEmpty()) ? "mealsnap-backup.zip" : name.replaceAll("[\\\\/:*?\"<>|]", "_");
                exportTmp = new File(getCacheDir(), "export.tmp");
                exportOut = new BufferedOutputStream(new FileOutputStream(exportTmp));
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean appendChunk(String b64) {
            try {
                exportOut.write(Base64.decode(b64, Base64.DEFAULT));
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** 다운로드 폴더에 저장하고 (share=true면) 공유 시트도 연다. 성공이면 "ok:<이름>", 실패면 "error:<이유>". */
        @JavascriptInterface
        public String finishFile(final boolean share) {
            try {
                exportOut.flush();
                exportOut.close();
                exportOut = null;
                ContentValues cv = new ContentValues();
                cv.put("_display_name", exportName);
                cv.put("mime_type", "application/zip");
                cv.put("relative_path", "Download/");
                final Uri uri = getContentResolver().insert(Uri.parse("content://media/external/downloads"), cv);
                if (uri == null) return "error:저장 위치를 만들 수 없어요";
                OutputStream os = getContentResolver().openOutputStream(uri);
                InputStream is = new FileInputStream(exportTmp);
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = is.read(buf)) > 0) os.write(buf, 0, n);
                is.close();
                os.close();
                exportTmp.delete();
                if (share) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            Intent send = new Intent(Intent.ACTION_SEND);
                            send.setType("application/zip");
                            send.putExtra(Intent.EXTRA_STREAM, uri);
                            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                            try { startActivity(Intent.createChooser(send, "백업 파일 공유")); } catch (Exception ignored) { }
                        }
                    });
                }
                return "ok:" + exportName;
            } catch (Exception e) {
                return "error:" + e.getMessage();
            }
        }

        @JavascriptInterface
        public void setDark(final boolean dark) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { applyBars(dark); }
            });
        }

        @JavascriptInterface
        public void toast(final String msg) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show(); }
            });
        }
    }

    private void closeExport() {
        try { if (exportOut != null) exportOut.close(); } catch (IOException ignored) { }
        exportOut = null;
    }

    /* ---------- 상태바/내비게이션바 색 (앱 배경·하단 메뉴 색과 맞춤) ---------- */
    private void applyBars(boolean dark) {
        int bg = dark ? 0xFF16120E : 0xFFFAF6F0;
        int nav = dark ? 0xFF221C16 : 0xFFFFFFFF;
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        w.setStatusBarColor(bg);
        w.setNavigationBarColor(nav);
        int flags = View.SYSTEM_UI_FLAG_VISIBLE;
        if (!dark) flags |= 0x2000 | 0x10; // 밝은 상태바 / 밝은 내비게이션바 아이콘(어두운 아이콘)
        w.getDecorView().setSystemUiVisibility(flags);
        w.setBackgroundDrawable(new ColorDrawable(bg));
        if (web != null) web.setBackgroundColor(bg);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() { super.onPause(); web.onPause(); }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }

    @Override
    protected void onDestroy() {
        closeExport();
        web.destroy();
        super.onDestroy();
    }
}
