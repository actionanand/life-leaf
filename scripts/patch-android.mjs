#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const androidRoot = path.join(root, 'android');
if (!existsSync(androidRoot)) {
  console.error('android/ is missing. Run npm run android:add first.');
  process.exit(1);
}

const manifestPath = path.join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml');
const gradlePath = path.join(androidRoot, 'app', 'build.gradle');
const javaPath = path.join(
  androidRoot,
  'app',
  'src',
  'main',
  'java',
  'com',
  'actionanand',
  'lifeleaf',
  'MainActivity.java',
);
await mkdir(path.dirname(javaPath), { recursive: true });
const drawableDirectory = path.join(androidRoot, 'app', 'src', 'main', 'res', 'drawable-nodpi');
await mkdir(drawableDirectory, { recursive: true });
await copyFile(
  path.join(root, 'src', 'assets', 'life-leaf.png'),
  path.join(drawableDirectory, 'life_leaf_splash_logo.png'),
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
await writeFile(manifestPath, manifest, 'utf8');

let gradle = await readFile(gradlePath, 'utf8');
if (!gradle.includes('androidx.biometric:biometric')) {
  gradle = gradle.replace(
    /dependencies\s*\{/,
    "dependencies {\n    implementation 'androidx.biometric:biometric:1.1.0'",
  );
  await writeFile(gradlePath, gradle, 'utf8');
}

const source = `package com.actionanand.lifeleaf;

import android.annotation.SuppressLint;
import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
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
import android.webkit.JavascriptInterface;
import android.widget.FrameLayout;
import android.widget.ImageView;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.KeyStore;
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
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode != EXPORT_DOCUMENT_REQUEST) return;
    byte[] contents = pendingExport;
    pendingExport = null;
    if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null || contents == null) return;
    try (OutputStream output = getContentResolver().openOutputStream(data.getData())) {
      if (output != null) output.write(contents);
    } catch (Exception ignored) { }
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode != NOTIFICATION_PERMISSION_REQUEST) return;
    boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
    if (granted) ensureReminderNotificationChannel();
    dispatchNativeResult("notification-permission", granted, granted ? "granted" : "denied", "");
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

  @SuppressWarnings("deprecation")
  private void applySystemBars(boolean dark) {
    int background = Color.parseColor(dark ? "#0F1C16" : "#F4F6F0");
    getWindow().setStatusBarColor(background);
    getWindow().setNavigationBarColor(background);
    getWindow().getDecorView().setBackgroundColor(background);
    getBridge().getWebView().setBackgroundColor(background);
    int flags = getWindow().getDecorView().getSystemUiVisibility();
    flags = dark ? flags & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR : flags | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
    flags = dark ? flags & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : flags | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
    getWindow().getDecorView().setSystemUiVisibility(flags);
  }

  private class LifeLeafNativeBridge {
    @JavascriptInterface
    public void setDarkMode(boolean enabled) { runOnUiThread(() -> applySystemBars(enabled)); }

    @JavascriptInterface
    public boolean notificationPermissionGranted() { return hasNotificationPermission(); }

    @JavascriptInterface
    public void requestNotificationPermission() {
      runOnUiThread(() -> {
        if (hasNotificationPermission()) {
          MainActivity.this.ensureReminderNotificationChannel();
          dispatchNativeResult("notification-permission", true, "granted", "");
          return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, NOTIFICATION_PERMISSION_REQUEST);
        }
      });
    }

    @JavascriptInterface
    public void ensureReminderNotificationChannel() { MainActivity.this.ensureReminderNotificationChannel(); }

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
console.log(
  'Applied Life Leaf Android splash (168dp), notification, share-target, biometric, screenshot and system-bar patches.',
);
