package expo.modules.exactalarms

import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val PERMISSION_CHANGED_EVENT = "onExactAlarmPermissionChange"

/**
 * expo-notifications schedules through AlarmManager but exposes nothing about
 * whether exact alarms are actually permitted. Android 14+ denies
 * SCHEDULE_EXACT_ALARM by default, so without this the app cannot tell an
 * on-the-minute schedule from a drifting one, and would have to nag every user
 * — including the ones already granted on Android 12/13.
 */
class ExactAlarmsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val alarmManager: AlarmManager
    get() = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  private var receiver: BroadcastReceiver? = null

  // Below API 31 exact alarms need no permission at all, so they are always available.
  private fun canSchedule(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()

  override fun definition() = ModuleDefinition {
    Name("ExactAlarms")

    Events(PERMISSION_CHANGED_EVENT)

    Function("canScheduleExactAlarms") {
      canSchedule()
    }

    /**
     * Opens the single per-app "Alarms & reminders" toggle. Pre-31 there is no
     * such screen, so fall back to the app's details page.
     */
    AsyncFunction("openSettings") {
      val uri = Uri.parse("package:${context.packageName}")
      val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, uri)
      } else {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, uri)
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    // The grant happens in a system screen, not in our activity, so the only
    // way to rebuild the schedule promptly is this broadcast.
    OnStartObserving {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || receiver != null) return@OnStartObserving
      val r = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
          sendEvent(PERMISSION_CHANGED_EVENT, mapOf("granted" to canSchedule()))
        }
      }
      ContextCompat.registerReceiver(
        context,
        r,
        IntentFilter(AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED),
        ContextCompat.RECEIVER_NOT_EXPORTED,
      )
      receiver = r
    }

    OnStopObserving {
      receiver?.let { context.unregisterReceiver(it) }
      receiver = null
    }

    OnDestroy {
      receiver?.let { runCatching { context.unregisterReceiver(it) } }
      receiver = null
    }
  }
}
