#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const androidRoot = path.join(root, 'android');
if (!existsSync(androidRoot)) {
  console.error('android/ is missing. Run npm run android:add first.');
  process.exit(1);
}

const manifestPath = path.join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml');
const gradlePath = path.join(androidRoot, 'app', 'build.gradle');
const proguardPath = path.join(androidRoot, 'app', 'proguard-rules.pro');
const stylesPath = path.join(androidRoot, 'app', 'src', 'main', 'res', 'values', 'styles.xml');
const nightStylesPath = path.join(androidRoot, 'app', 'src', 'main', 'res', 'values-night', 'styles.xml');
const javaPath = path.join(
  androidRoot,
  'app',
  'src',
  'main',
  'java',
  'com',
  'actionanand',
  'lifeleaf',
  'app',
  'MainActivity.java',
);
const receiverPath = path.join(
  androidRoot,
  'app',
  'src',
  'main',
  'java',
  'com',
  'actionanand',
  'lifeleaf',
  'app',
  'LifeLeafReminderReceiver.java',
);
const staleJavaPath = path.join(
  androidRoot,
  'app',
  'src',
  'main',
  'java',
  'com',
  'actionanand',
  'lifeleaf',
  'app',
  'app',
  'MainActivity.java',
);
await rm(staleJavaPath, { force: true });
await mkdir(path.dirname(javaPath), { recursive: true });
const drawableDirectory = path.join(androidRoot, 'app', 'src', 'main', 'res', 'drawable-nodpi');
await mkdir(drawableDirectory, { recursive: true });
await copyFile(
  path.join(root, 'src', 'assets', 'life-leaf.png'),
  path.join(drawableDirectory, 'life_leaf_splash_logo.png'),
);
const drawableXmlDirectory = path.join(androidRoot, 'app', 'src', 'main', 'res', 'drawable');
await mkdir(drawableXmlDirectory, { recursive: true });
await writeFile(
  path.join(drawableXmlDirectory, 'life_leaf_splash_icon.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item
        android:width="168dp"
        android:height="168dp"
        android:gravity="center"
        android:drawable="@drawable/life_leaf_splash_logo" />
</layer-list>
`,
  'utf8',
);
await writeFile(
  path.join(drawableXmlDirectory, 'ic_stat_life_leaf.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M17.7,4.3c-3.7,0.4 -7.3,2.1 -9.7,4.6 -2.2,2.3 -3,5.2 -2.2,7.7L3.3,19.1c-0.4,0.4 -0.4,1 0,1.4s1,0.4 1.4,0l2.4,-2.4c1.2,0.7 2.6,1 4.1,0.8 2.8,-0.3 5.3,-2 6.9,-4.7 1.5,-2.5 2.1,-5.7 1.7,-8.8 -0.1,-0.7 -0.7,-1.2 -1.4,-1.1h-0.7zM8.2,15.4c0.6,-2.8 2.9,-5.3 6.7,-7.2 0.5,-0.2 1.1,0 1.3,0.4 0.2,0.5 0,1.1 -0.4,1.3 -3.2,1.6 -5,3.6 -5.6,5.8 2.4,0.3 4.8,-1.1 6,-3.2 0.9,-1.5 1.4,-3.5 1.4,-5.6 -2.9,0.5 -5.7,1.9 -7.8,4 -1.4,1.5 -2,3.1 -1.6,4.5z" />
</vector>`,
  'utf8',
);
const xmlDirectory = path.join(androidRoot, 'app', 'src', 'main', 'res', 'xml');
await mkdir(xmlDirectory, { recursive: true });
await writeFile(
  path.join(xmlDirectory, 'data_extraction_rules.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup><exclude domain="root" path="." /></cloud-backup>
  <device-transfer><exclude domain="root" path="." /></device-transfer>
</data-extraction-rules>\n`,
  'utf8',
);
await writeFile(
  path.join(xmlDirectory, 'backup_rules.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content><exclude domain="root" path="." /></full-backup-content>\n`,
  'utf8',
);

let manifest = await readFile(manifestPath, 'utf8');
if (!manifest.includes('POST_NOTIFICATIONS')) {
  manifest = manifest.replace(
    '<application',
    '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n\n    <application',
  );
}
manifest = manifest
  .replace(/android:allowBackup="[^"]*"/g, 'android:allowBackup="false"')
  .replace(/android:fullBackupContent="[^"]*"/g, 'android:fullBackupContent="false"');
if (!manifest.includes('LIFE_LEAF_SHARE_TARGET')) {
  const shareTargets = `
            <!-- LIFE_LEAF_SHARE_TARGET: user-selected content only; no storage permission. -->
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="image/*" />
            </intent-filter>`;
  manifest = manifest.replace(/(\s*<\/activity>)/, `${shareTargets}$1`);
}
if (!manifest.includes('LifeLeafReminderReceiver')) {
  manifest = manifest.replace(
    '</application>',
    '        <receiver android:name=".LifeLeafReminderReceiver" android:exported="false" />\n    </application>',
  );
}
await writeFile(manifestPath, manifest, 'utf8');

let gradle = await readFile(gradlePath, 'utf8');
gradle = gradle
  .replace(/minifyEnabled\s+false/, 'minifyEnabled true')
  .replace(
    /getDefaultProguardFile\(['"]proguard-android\.txt['"]\)/g,
    "getDefaultProguardFile('proguard-android-optimize.txt')",
  );
if (!gradle.includes('shrinkResources true')) {
  gradle = gradle.replace(/minifyEnabled\s+true/, 'minifyEnabled true\n            shrinkResources true');
}
gradle = gradle
  .replace(/minifyEnabled\s+false/, 'minifyEnabled true')
  .replace(
    /getDefaultProguardFile\(['"]proguard-android\.txt['"]\)/g,
    "getDefaultProguardFile('proguard-android-optimize.txt')",
  );
if (!gradle.includes('shrinkResources true')) {
  gradle = gradle.replace(/minifyEnabled\s+true/, 'minifyEnabled true\n            shrinkResources true');
}
if (!gradle.includes('androidx.biometric:biometric')) {
  gradle = gradle.replace(
    /dependencies\s*\{/,
    "dependencies {\n    implementation 'androidx.biometric:biometric:1.1.0'",
  );
}
await writeFile(gradlePath, gradle, 'utf8');

if (!/minifyEnabled\s+true/.test(gradle) || !gradle.includes('shrinkResources true')) {
  throw new Error(`Could not enable R8 release optimization in ${gradlePath}.`);
}
if (!/getDefaultProguardFile\(['"]proguard-android-optimize\.txt['"]\)/.test(gradle)) {
  throw new Error(`The optimized default ProGuard configuration is missing from ${gradlePath}.`);
}

const webViewKeepRules = `
# Life Leaf exposes these methods to the Angular WebView at runtime.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
`;
const tinkAnnotationComment = `

# Google Tink references these JSR-305 and Error Prone annotations as build-time metadata. Android
# does not ship the annotation classes, and Tink does not require them at runtime.
`;
const tinkAnnotationRules = [
  '-dontwarn javax.annotation.Nullable',
  '-dontwarn javax.annotation.concurrent.GuardedBy',
  '-dontwarn com.google.errorprone.annotations.CanIgnoreReturnValue',
  '-dontwarn com.google.errorprone.annotations.CheckReturnValue',
  '-dontwarn com.google.errorprone.annotations.Immutable',
  '-dontwarn com.google.errorprone.annotations.RestrictedApi',
];
let proguardRules = existsSync(proguardPath) ? await readFile(proguardPath, 'utf8') : '';
if (!proguardRules.includes('@android.webkit.JavascriptInterface <methods>')) {
  proguardRules = `${proguardRules.trimEnd()}${webViewKeepRules}`;
}
if (!proguardRules.includes('# Google Tink references these JSR-305 and Error Prone annotations')) {
  proguardRules = `${proguardRules.trimEnd()}${tinkAnnotationComment}`;
}
for (const annotationRule of tinkAnnotationRules) {
  if (!proguardRules.includes(annotationRule)) {
    proguardRules = `${proguardRules.trimEnd()}\n${annotationRule}\n`;
  }
}
await writeFile(proguardPath, `${proguardRules.trimEnd()}\n`, 'utf8');

for (const annotationRule of tinkAnnotationRules) {
  if (!proguardRules.includes(annotationRule)) {
    throw new Error(`Required R8 rule was not written to ${proguardPath}: ${annotationRule}`);
  }
}

const ensureThemes = async (filePath, dark) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  let styles = existsSync(filePath)
    ? await readFile(filePath, 'utf8')
    : '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n';
  const body = `    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="android:statusBarColor">${dark ? '#0F1C16' : '#F4F6F0'}</item>
        <item name="android:navigationBarColor">${dark ? '#0F1C16' : '#F4F6F0'}</item>
        <item name="android:windowLightStatusBar">${dark ? 'false' : 'true'}</item>
        <item name="android:windowLightNavigationBar">${dark ? 'false' : 'true'}</item>
    </style>
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">#F4F6F0</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/life_leaf_splash_icon</item>
        <item name="windowSplashScreenIconBackgroundColor">@android:color/transparent</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
        <item name="android:statusBarColor">#F4F6F0</item>
        <item name="android:navigationBarColor">#F4F6F0</item>
        <item name="android:windowLightStatusBar">true</item>
        <item name="android:windowLightNavigationBar">true</item>
    </style>`;
  styles = styles.replace(/\s*<style name="AppTheme\.NoActionBar"[\s\S]*?<\/style>/g, '');
  styles = styles.replace(/\s*<style name="AppTheme\.NoActionBarLaunch"[\s\S]*?<\/style>/g, '');
  styles = styles.replace('</resources>', `${body}\n</resources>`);
  await writeFile(filePath, styles, 'utf8');
};
await ensureThemes(stylesPath, false);
await ensureThemes(nightStylesPath, true);

const source = `package com.actionanand.lifeleaf.app;

import android.annotation.SuppressLint;
import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.widget.FrameLayout;
import android.widget.ImageView;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.KeyStore;
import java.util.Calendar;
import java.util.concurrent.Executor;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
  private static final int EXPORT_DOCUMENT_REQUEST = 7301;
  private static final int NOTIFICATION_PERMISSION_REQUEST = 7302;
  private static final String REMINDER_CHANNEL_ID = "life-leaf-reminders";
  private static final String REMINDER_ALARM_ACTION = "com.actionanand.lifeleaf.app.REMINDER_ALARM";
  private static final int REMINDER_ALARM_ID_BASE = 9040;
  private static final String BIOMETRIC_KEY_ALIAS = "life_leaf_biometric_key";
  private static final String SECURITY_PREFERENCES = "life_leaf_security";
  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private View launchOverlay;
  private long launchOverlayShownAt;
  private byte[] pendingExport;
  private BiometricPrompt biometricPrompt;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    applySystemBars(false);
    showLaunchOverlay();
    getBridge().getWebView().addJavascriptInterface(new LifeLeafNativeBridge(), "LifeLeafNative");
    mainHandler.postDelayed(() -> {
      dispatchSharedIntent(getIntent());
      hideLaunchOverlay();
    }, 950L);
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    dispatchSharedIntent(intent);
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    if (requestCode == EXPORT_DOCUMENT_REQUEST) {
      byte[] contents = pendingExport;
      pendingExport = null;
      Uri destination = data == null ? null : data.getData();
      if (resultCode != Activity.RESULT_OK || destination == null || contents == null) {
        dispatchNativeResult("export-file", false, "", "The export was cancelled.");
        return;
      }
      final byte[] payload = contents;
      new Thread(() -> {
        try (OutputStream output = getContentResolver().openOutputStream(destination, "w")) {
          if (output == null) throw new IllegalStateException("The selected location could not be opened.");
          output.write(payload);
          output.flush();
          dispatchNativeResult("export-file", true, "", "");
        } catch (Exception error) {
          dispatchNativeResult(
            "export-file",
            false,
            "",
            error.getMessage() == null ? "The file could not be saved." : error.getMessage()
          );
        }
      }).start();
      return;
    }
    super.onActivityResult(requestCode, resultCode, data);
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    if (requestCode == NOTIFICATION_PERMISSION_REQUEST) {
      boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
      if (granted) ensureReminderNotificationChannel();
      dispatchNativeResult("notification-permission", true, granted ? "granted" : "denied", "");
      return;
    }
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
  }

  private void dispatchSharedIntent(Intent intent) {
    if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
    String type = intent.getType() == null ? "" : intent.getType();
    String text = intent.getStringExtra(Intent.EXTRA_TEXT);
    Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
    if (stream != null && type.startsWith("image/")) {
      try {
        File directory = new File(getCacheDir(), "shared");
        directory.mkdirs();
        String extension = type.contains("png") ? ".png" : type.contains("webp") ? ".webp" : ".jpg";
        File copy = new File(directory, "shared-" + System.currentTimeMillis() + extension);
        try (InputStream input = getContentResolver().openInputStream(stream); FileOutputStream output = new FileOutputStream(copy)) {
          if (input != null) {
            byte[] buffer = new byte[8192];
            int length;
            while ((length = input.read(buffer)) > 0) output.write(buffer, 0, length);
            stream = Uri.fromFile(copy);
          }
        }
      } catch (Exception ignored) { }
    }
    String script = "window.dispatchEvent(new CustomEvent('life-leaf-share',{detail:{"
      + "type:" + JSONObject.quote(type) + ","
      + "text:" + JSONObject.quote(text == null ? "" : text) + ","
      + "uri:" + JSONObject.quote(stream == null ? "" : stream.toString())
      + "}}));";
    getBridge().getWebView().evaluateJavascript(script, null);
    intent.setAction(Intent.ACTION_MAIN);
  }

  private void showLaunchOverlay() {
    FrameLayout overlay = new FrameLayout(this);
    overlay.setBackgroundColor(Color.parseColor("#F4F6F0"));
    overlay.setClickable(true);
    ImageView icon = new ImageView(this);
    icon.setImageResource(R.drawable.life_leaf_splash_logo);
    icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
    FrameLayout.LayoutParams iconLayout = new FrameLayout.LayoutParams(dp(168), dp(168));
    iconLayout.gravity = Gravity.CENTER;
    overlay.addView(icon, iconLayout);
    addContentView(overlay, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    launchOverlay = overlay;
    launchOverlayShownAt = System.currentTimeMillis();
  }

  private void hideLaunchOverlay() {
    View overlay = launchOverlay;
    if (overlay == null) return;
    long remaining = Math.max(0L, 1100L - (System.currentTimeMillis() - launchOverlayShownAt));
    if (remaining > 0L) { mainHandler.postDelayed(this::hideLaunchOverlay, remaining); return; }
    launchOverlay = null;
    overlay.animate().alpha(0f).setDuration(180L).withEndAction(() -> {
      if (overlay.getParent() instanceof ViewGroup) ((ViewGroup) overlay.getParent()).removeView(overlay);
    }).start();
  }

  private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

  private boolean hasNotificationPermission() {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
      || ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
  }

  private void ensureReminderNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager manager = getSystemService(NotificationManager.class);
    if (manager == null || manager.getNotificationChannel(REMINDER_CHANNEL_ID) != null) return;
    NotificationChannel channel = new NotificationChannel(
      REMINDER_CHANNEL_ID,
      "Diary reminders",
      NotificationManager.IMPORTANCE_DEFAULT
    );
    channel.setDescription("Private reminders to write in Life Leaf");
    channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
    manager.createNotificationChannel(channel);
  }

  private void scheduleWeeklyReminders(int hour, int minute, String daysCsv) {
    cancelReminderAlarms();
    ensureReminderNotificationChannel();
    AlarmManager alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
    if (alarmManager == null) throw new IllegalStateException("Android reminders are unavailable.");
    String[] parts = daysCsv == null ? new String[0] : daysCsv.split(",");
    for (String rawDay : parts) {
      if (rawDay == null || rawDay.trim().isEmpty()) continue;
      int day = Integer.parseInt(rawDay.trim());
      if (day < Calendar.SUNDAY || day > Calendar.SATURDAY) continue;
      Calendar calendar = Calendar.getInstance();
      calendar.set(Calendar.DAY_OF_WEEK, day);
      calendar.set(Calendar.HOUR_OF_DAY, hour);
      calendar.set(Calendar.MINUTE, minute);
      calendar.set(Calendar.SECOND, 0);
      calendar.set(Calendar.MILLISECOND, 0);
      if (calendar.getTimeInMillis() <= System.currentTimeMillis()) calendar.add(Calendar.WEEK_OF_YEAR, 1);
      alarmManager.setInexactRepeating(
        AlarmManager.RTC_WAKEUP,
        calendar.getTimeInMillis(),
        AlarmManager.INTERVAL_DAY * 7,
        reminderPendingIntent(day)
      );
    }
  }

  private void cancelReminderAlarms() {
    AlarmManager alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
    if (alarmManager == null) return;
    for (int day = Calendar.SUNDAY; day <= Calendar.SATURDAY; day++) {
      alarmManager.cancel(reminderPendingIntent(day));
    }
  }

  private PendingIntent reminderPendingIntent(int day) {
    Intent intent = new Intent(this, LifeLeafReminderReceiver.class);
    intent.setAction(REMINDER_ALARM_ACTION);
    intent.putExtra("notification_id", REMINDER_ALARM_ID_BASE + day);
    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
    return PendingIntent.getBroadcast(this, REMINDER_ALARM_ID_BASE + day, intent, flags);
  }

  @SuppressWarnings("deprecation")
  private void applySystemBars(boolean dark) {
    Window window = getWindow();
    int background = Color.parseColor(dark ? "#0F1C16" : "#F4F6F0");
    window.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(background));
    window.setStatusBarColor(background);
    window.setNavigationBarColor(background);
    window.getDecorView().setBackgroundColor(background);
    getBridge().getWebView().setBackgroundColor(background);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.setStatusBarContrastEnforced(false);
      window.setNavigationBarContrastEnforced(false);
    }
    View decor = window.getDecorView();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      WindowInsetsController controller = decor.getWindowInsetsController();
      if (controller != null) {
        int appearance = dark ? 0 : WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
          | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
        controller.setSystemBarsAppearance(
          appearance,
          WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
            | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        );
      }
      return;
    }
    int flags = decor.getSystemUiVisibility();
    flags = dark ? flags & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR : flags | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      flags = dark ? flags & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : flags | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
    }
    decor.setSystemUiVisibility(flags);
  }

  private class LifeLeafNativeBridge {
    @JavascriptInterface
    public void setDarkMode(boolean enabled) { runOnUiThread(() -> applySystemBars(enabled)); }

    @JavascriptInterface
    public boolean notificationPermissionGranted() { return hasNotificationPermission(); }

    @JavascriptInterface
    public void requestNotificationPermission() {
      runOnUiThread(() -> {
        try {
          if (hasNotificationPermission()) {
            MainActivity.this.ensureReminderNotificationChannel();
            dispatchNativeResult("notification-permission", true, "granted", "");
            return;
          }
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, NOTIFICATION_PERMISSION_REQUEST);
          } else {
            dispatchNativeResult("notification-permission", false, "", "Notification permission could not be requested.");
          }
        } catch (Exception error) {
          dispatchNativeResult(
            "notification-permission",
            false,
            "",
            error.getMessage() == null ? "Notification permission could not be requested." : error.getMessage()
          );
        }
      });
    }

    @JavascriptInterface
    public void ensureReminderNotificationChannel() { MainActivity.this.ensureReminderNotificationChannel(); }

    @JavascriptInterface
    public void scheduleReminder(int hour, int minute, String daysCsv) {
      runOnUiThread(() -> {
        try {
          if (!hasNotificationPermission()) {
            dispatchNativeResult("reminder-schedule", false, "", "Notification permission was not granted.");
            return;
          }
          MainActivity.this.scheduleWeeklyReminders(hour, minute, daysCsv);
          dispatchNativeResult("reminder-schedule", true, "", "");
        } catch (Exception error) {
          dispatchNativeResult(
            "reminder-schedule",
            false,
            "",
            error.getMessage() == null ? "Reminder could not be scheduled." : error.getMessage()
          );
        }
      });
    }

    @JavascriptInterface
    public void cancelReminder() {
      runOnUiThread(() -> {
        try {
          MainActivity.this.cancelReminderAlarms();
          dispatchNativeResult("reminder-cancel", true, "", "");
        } catch (Exception error) {
          dispatchNativeResult(
            "reminder-cancel",
            false,
            "",
            error.getMessage() == null ? "Reminder could not be cancelled." : error.getMessage()
          );
        }
      });
    }

    @JavascriptInterface
    public boolean isBiometricAvailable() {
      return BiometricManager.from(MainActivity.this).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
        == BiometricManager.BIOMETRIC_SUCCESS;
    }

    @JavascriptInterface
    public void enableBiometric(String secret) {
      runOnUiThread(() -> {
        try {
          byte[] plaintext = secret.getBytes(java.nio.charset.StandardCharsets.UTF_8);
          Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
          cipher.init(Cipher.ENCRYPT_MODE, createBiometricKey());
          showBiometricPrompt("Enable biometric unlock", cipher, () -> {
            try {
              byte[] encrypted = cipher.doFinal(plaintext);
              getSharedPreferences(SECURITY_PREFERENCES, MODE_PRIVATE).edit()
                .putString("wrapped_secret", Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString("wrapped_iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .apply();
              java.util.Arrays.fill(plaintext, (byte) 0);
              dispatchNativeResult("biometric-enabled", true, "", "");
            } catch (Exception error) { dispatchNativeResult("biometric-enabled", false, "", error.getMessage()); }
          }, "biometric-enabled");
        } catch (Exception error) { dispatchNativeResult("biometric-enabled", false, "", error.getMessage()); }
      });
    }

    @JavascriptInterface
    public void authenticateBiometric() {
      runOnUiThread(() -> {
        try {
          String wrapped = getSharedPreferences(SECURITY_PREFERENCES, MODE_PRIVATE).getString("wrapped_secret", null);
          String iv = getSharedPreferences(SECURITY_PREFERENCES, MODE_PRIVATE).getString("wrapped_iv", null);
          if (wrapped == null || iv == null) throw new IllegalStateException("Biometric unlock is not configured.");
          KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
          keyStore.load(null);
          SecretKey key = (SecretKey) keyStore.getKey(BIOMETRIC_KEY_ALIAS, null);
          if (key == null) throw new IllegalStateException("Enable biometric unlock again.");
          Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
          cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Base64.decode(iv, Base64.DEFAULT)));
          showBiometricPrompt("Unlock Life Leaf", cipher, () -> {
            try {
              byte[] raw = cipher.doFinal(Base64.decode(wrapped, Base64.DEFAULT));
              String secret = new String(raw, java.nio.charset.StandardCharsets.UTF_8);
              java.util.Arrays.fill(raw, (byte) 0);
              dispatchNativeResult("biometric-unlock", true, secret, "");
            } catch (Exception error) { dispatchNativeResult("biometric-unlock", false, "", error.getMessage()); }
          }, "biometric-unlock");
        } catch (Exception error) { dispatchNativeResult("biometric-unlock", false, "", error.getMessage()); }
      });
    }

    @JavascriptInterface
    public void disableBiometric() {
      try {
        getSharedPreferences(SECURITY_PREFERENCES, MODE_PRIVATE).edit().clear().apply();
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(BIOMETRIC_KEY_ALIAS)) keyStore.deleteEntry(BIOMETRIC_KEY_ALIAS);
      } catch (Exception ignored) { }
    }

    @JavascriptInterface
    public void exportFile(String filename, String mimeType, String contents) {
      runOnUiThread(() -> {
        pendingExport = contents == null ? new byte[0] : contents.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType == null || mimeType.isEmpty() ? "application/json" : mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename == null || filename.isEmpty() ? "life-leaf-backup.lifeleaf" : filename.replaceAll("[^A-Za-z0-9._-]", "-"));
        startActivityForResult(intent, EXPORT_DOCUMENT_REQUEST);
      });
    }

    @JavascriptInterface
    public void setScreenshotProtection(boolean enabled) {
      runOnUiThread(() -> {
        if (enabled) getWindow().setFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE, android.view.WindowManager.LayoutParams.FLAG_SECURE);
        else getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
      });
    }

    @JavascriptInterface
    public String appVersion() {
      try {
        PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
        return info.versionName == null ? "" : info.versionName;
      } catch (Exception ignored) { return ""; }
    }
  }

  private SecretKey createBiometricKey() throws Exception {
    KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
    KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
      BIOMETRIC_KEY_ALIAS,
      KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
    ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setUserAuthenticationRequired(true)
      .setInvalidatedByBiometricEnrollment(true);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
    } else {
      builder.setUserAuthenticationValidityDurationSeconds(-1);
    }
    generator.init(builder.build());
    return generator.generateKey();
  }

  private void showBiometricPrompt(String title, Cipher cipher, Runnable success, String action) {
    if (biometricPrompt != null) { dispatchNativeResult(action, false, "", "Biometric authentication is already in progress."); return; }
    Executor executor = ContextCompat.getMainExecutor(this);
    biometricPrompt = new BiometricPrompt(this, executor, new BiometricPrompt.AuthenticationCallback() {
      @Override
      public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
        super.onAuthenticationSucceeded(result);
        biometricPrompt = null;
        success.run();
      }
      @Override
      public void onAuthenticationError(int code, CharSequence message) {
        super.onAuthenticationError(code, message);
        biometricPrompt = null;
        dispatchNativeResult(action, false, "", message.toString());
      }
    });
    BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
      .setTitle(title)
      .setSubtitle("Confirm your identity on this device")
      .setNegativeButtonText("Use PIN")
      .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
      .build();
    biometricPrompt.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
  }

  private void dispatchNativeResult(String action, boolean success, String data, String message) {
    runOnUiThread(() -> {
      String script = "window.dispatchEvent(new CustomEvent('life-leaf-native-result',{detail:{"
        + "action:" + JSONObject.quote(action) + ",success:" + success + ","
        + "data:" + JSONObject.quote(data == null ? "" : data) + ","
        + "message:" + JSONObject.quote(message == null ? "" : message) + "}}));";
      getBridge().getWebView().evaluateJavascript(script, null);
    });
  }
}
`;

await writeFile(javaPath, source, 'utf8');
await writeFile(
  receiverPath,
  `package com.actionanand.lifeleaf.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

public class LifeLeafReminderReceiver extends BroadcastReceiver {
  private static final String CHANNEL_ID = "life-leaf-reminders";

  @Override
  public void onReceive(Context context, Intent intent) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
      && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      return;
    }
    ensureChannel(context);
    Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
    if (launch == null) launch = new Intent(context, MainActivity.class);
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
    PendingIntent contentIntent = PendingIntent.getActivity(context, 9101, launch, flags);
    NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_life_leaf)
      .setColor(Color.parseColor("#2F855A"))
      .setContentTitle("A moment for today")
      .setContentText("Write down something you'd like to remember.")
      .setStyle(new NotificationCompat.BigTextStyle().bigText("Write down something you'd like to remember."))
      .setContentIntent(contentIntent)
      .setAutoCancel(true)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT);
    int id = intent == null ? 9041 : intent.getIntExtra("notification_id", 9041);
    NotificationManagerCompat.from(context).notify(id, builder.build());
  }

  private void ensureChannel(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager manager = context.getSystemService(NotificationManager.class);
    if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
    NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Diary reminders", NotificationManager.IMPORTANCE_DEFAULT);
    channel.setDescription("Private reminders to write in Life Leaf");
    channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PRIVATE);
    manager.createNotificationChannel(channel);
  }
}
`,
  'utf8',
);
console.log(
  'Applied Life Leaf Android splash (168dp), notification, share-target, biometric, screenshot and system-bar patches.',
);
