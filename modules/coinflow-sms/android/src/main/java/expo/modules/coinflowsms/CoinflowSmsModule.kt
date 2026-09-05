package expo.modules.coinflowsms

import android.Manifest
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * FILE PURPOSE
 * ------------
 * The one native module CoinFlow's JS code can call directly and synchronously — but ONLY for
 * checking/requesting the `RECEIVE_SMS`/`READ_SMS` permissions and checking whether SMS capture
 * is supported at all. It deliberately does NOT do anything related to actually receiving or
 * processing SMS — that entire flow runs through `SmsReceiver` + `CoinflowSmsHeadlessTaskService`
 * (this same folder) instead, triggered by Android itself, not by a JS call into this module.
 *
 * WHERE IT FITS
 * -------------
 * `modules/coinflow-sms/src/index.ts` is the JS wrapper that calls into this module's three
 * functions (`isSupported`, `getPermissionsAsync`, `requestPermissionsAsync`); `src/services/sms.ts`
 * is the one place in the app's own `src/` code allowed to import that JS wrapper.
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
