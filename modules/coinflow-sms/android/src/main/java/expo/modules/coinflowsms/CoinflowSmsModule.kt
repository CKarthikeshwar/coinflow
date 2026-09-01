package expo.modules.coinflowsms

import android.Manifest
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Minimal bridge surface (SPEC-implementation.md §17.6 / D24). No custom events — the
 * app-killed wake path goes entirely through [SmsReceiver] + the headless service, not
 * through this module. This module exists only for capability + permission checks.
 */
class CoinflowSmsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CoinflowSms")

    Function("isSupported") {
      true
    }

    AsyncFunction("getPermissionsAsync") { promise: Promise ->
      Permissions.getPermissionsWithPermissionsManager(
        appContext.permissions,
        promise,
        Manifest.permission.RECEIVE_SMS,
        Manifest.permission.READ_SMS
      )
    }

    AsyncFunction("requestPermissionsAsync") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(
        appContext.permissions,
        promise,
        Manifest.permission.RECEIVE_SMS,
        Manifest.permission.READ_SMS
      )
    }
  }
}
