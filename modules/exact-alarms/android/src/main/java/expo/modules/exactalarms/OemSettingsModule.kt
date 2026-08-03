package expo.modules.exactalarms

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/*
 * Aggressive OEM ROMs block background process starts by default. That stops
 * expo-notifications' NotificationsService receiver from ever running, so a
 * scheduled notification sits queued until the user happens to open the app —
 * observed on HyperOS: reminders arrived only on launch, never on time.
 *
 * The toggle lives in a vendor settings app and cannot be granted
 * programmatically. Taking the user straight to the screen is the most any app
 * can do. None of these component names are public API: they move between ROM
 * versions, so each is attempted defensively and a miss falls through to the
 * next candidate, then to the app's own details page.
 */
private val AUTOSTART_COMPONENTS = listOf(
  "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity",
  "com.huawei.systemmanager" to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
  "com.huawei.systemmanager" to "com.huawei.systemmanager.optimize.process.ProtectActivity",
  "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
  "com.coloros.safecenter" to "com.coloros.safecenter.startupapp.StartupAppListActivity",
  "com.oppo.safe" to "com.oppo.safe.permission.startup.StartupAppListActivity",
  "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
  "com.iqoo.secure" to "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity",
  "com.letv.android.letvsafe" to "com.letv.android.letvsafe.AutobootManageActivity",
)

/** Vendors known to need the extra grant. Stock Android is deliberately absent. */
private val AGGRESSIVE_MANUFACTURERS = setOf(
  "xiaomi", "redmi", "poco", "huawei", "honor", "oppo", "realme",
  "vivo", "oneplus", "meizu", "letv",
)

class OemSettingsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("OemSettings")

    Function("getManufacturer") {
      Build.MANUFACTURER ?: ""
    }

    // There is no API to read whether autostart is actually granted, so this
    // only answers "is this a ROM where the user probably has to grant it".
    Function("needsAutostart") {
      (Build.MANUFACTURER ?: "").lowercase() in AGGRESSIVE_MANUFACTURERS
    }

    /** True if a vendor autostart screen opened, false if we fell back. */
    AsyncFunction("openAutostartSettings") {
      for ((pkg, cls) in AUTOSTART_COMPONENTS) {
        try {
          context.startActivity(
            Intent()
              .setComponent(ComponentName(pkg, cls))
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
          )
          return@AsyncFunction true
        } catch (_: Throwable) {
          // Wrong vendor, or the activity moved in this ROM version.
        }
      }
      try {
        context.startActivity(
          Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:${context.packageName}"),
          ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
      } catch (_: Throwable) {
        // Nothing left to try; the UI still explains the manual path.
      }
      false
    }
  }
}
