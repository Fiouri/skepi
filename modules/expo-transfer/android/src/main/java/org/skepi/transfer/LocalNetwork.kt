package org.skepi.transfer

import android.annotation.SuppressLint
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSpecifier
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.net.Inet4Address
import java.net.InetAddress
import java.net.NetworkInterface
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class LocalNetworkException(val code: String, message: String) : Exception(message)

/**
 * Local networks for P2P: the host's address on a shared LAN, a LocalOnlyHotspot (no router), and
 * the receiver joining that hotspot with WifiNetworkSpecifier (a local-only network: Android keeps
 * internet traffic on the other networks). Nothing here touches the internet.
 */
class LocalNetwork(private val context: Context) {
  private val cm = context.getSystemService(ConnectivityManager::class.java)
  private val wifi = context.applicationContext.getSystemService(WifiManager::class.java)
  private val main = Handler(Looper.getMainLooper())

  private var reservation: WifiManager.LocalOnlyHotspotReservation? = null
  private var joinCallback: ConnectivityManager.NetworkCallback? = null

  /** The joined hotspot network (receiver), used to open the client's sockets. */
  @Volatile var joined: Network? = null
    private set

  class Hotspot(val ssid: String, val psk: String, val address: String)

  /** Site-local IPv4 addresses of every up interface, by interface name. */
  fun interfaceAddresses(): Map<String, List<String>> =
    NetworkInterface.getNetworkInterfaces().toList()
      .filter { runCatching { it.isUp && !it.isLoopback }.getOrDefault(false) }
      .associate { nif ->
        nif.name to nif.inetAddresses.toList().filterIsInstance<Inet4Address>().filter { it.isSiteLocalAddress }.mapNotNull { it.hostAddress }
      }
      .filterValues { it.isNotEmpty() }

  /** The host's address on the shared LAN (Wi-Fi or Ethernet, with or without internet). */
  @Suppress("DEPRECATION")
  fun lanAddress(): String? {
    for (n in cm.allNetworks) {
      val caps = cm.getNetworkCapabilities(n) ?: continue
      if (!caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) && !caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) continue
      val lp = cm.getLinkProperties(n) ?: continue
      val a = lp.linkAddresses.map { it.address }.filterIsInstance<Inet4Address>().firstOrNull { it.isSiteLocalAddress }
      if (a != null) return a.hostAddress
    }
    return null
  }

  /**
   * Starts a LocalOnlyHotspot (Android 8+; Android 13+ needs NEARBY_WIFI_DEVICES, older versions fine
   * location). Its SSID and password are random per start; the host's address is the new interface's.
   */
  @SuppressLint("MissingPermission")
  fun startHotspot(timeoutMs: Long = 20_000): Hotspot {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) throw LocalNetworkException("ERR_P2P_HOTSPOT_UNSUPPORTED", "LocalOnlyHotspot needs Android 8")
    stopHotspot()
    val before = interfaceAddresses().values.flatten().toSet()
    val latch = CountDownLatch(1)
    var failure: Int? = null
    wifi.startLocalOnlyHotspot(
      object : WifiManager.LocalOnlyHotspotCallback() {
        override fun onStarted(r: WifiManager.LocalOnlyHotspotReservation) {
          reservation = r
          latch.countDown()
        }

        override fun onFailed(reason: Int) {
          failure = reason
          latch.countDown()
        }

        override fun onStopped() {
          reservation = null
        }
      },
      main,
    )
    if (!latch.await(timeoutMs, TimeUnit.MILLISECONDS)) throw LocalNetworkException("ERR_P2P_HOTSPOT", "the hotspot did not start")
    failure?.let { throw LocalNetworkException("ERR_P2P_HOTSPOT", "the hotspot failed to start (reason $it; is Wi-Fi tethering or another hotspot on?)") }
    val r = reservation ?: throw LocalNetworkException("ERR_P2P_HOTSPOT", "no hotspot reservation")
    val (ssid, psk) = credentials(r)
    // The soft AP interface comes up shortly after onStarted.
    var address: String? = null
    val deadline = System.currentTimeMillis() + 5_000
    while (address == null && System.currentTimeMillis() < deadline) {
      val now = interfaceAddresses()
      address = now.entries.firstOrNull { (name, addrs) -> name.startsWith("ap") || name.startsWith("swlan") }?.value?.firstOrNull()
        ?: now.values.flatten().firstOrNull { it !in before }
      if (address == null) Thread.sleep(200)
    }
    if (address == null) {
      stopHotspot()
      throw LocalNetworkException("ERR_P2P_HOTSPOT", "the hotspot has no address")
    }
    return Hotspot(ssid, psk, address)
  }

  @Suppress("DEPRECATION")
  private fun credentials(r: WifiManager.LocalOnlyHotspotReservation): Pair<String, String> {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val c = r.softApConfiguration
      val ssid = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) c.wifiSsid?.toString()?.trim('"') else c.ssid
      return (ssid ?: "") to (c.passphrase ?: "")
    }
    val c = r.wifiConfiguration ?: return "" to ""
    return (c.SSID ?: "").trim('"') to (c.preSharedKey ?: "").trim('"')
  }

  fun stopHotspot() {
    reservation?.close()
    reservation = null
  }

  /**
   * Receiver: joins the host's hotspot as a local-only network (Android 10+; the system asks the user
   * to confirm). Older versions join from the Wi-Fi settings, then the LAN path applies.
   */
  fun joinHotspot(ssid: String, psk: String, timeoutMs: Long = 90_000): Network {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) throw LocalNetworkException("ERR_P2P_JOIN_UNSUPPORTED", "join \"$ssid\" in the Wi-Fi settings, then scan again")
    leave()
    val specifier = WifiNetworkSpecifier.Builder().setSsid(ssid).setWpa2Passphrase(psk).build()
    val request = NetworkRequest.Builder()
      .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
      .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
      .setNetworkSpecifier(specifier)
      .build()
    val latch = CountDownLatch(1)
    var got: Network? = null
    val cb = object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) {
        got = network
        latch.countDown()
      }

      override fun onUnavailable() {
        latch.countDown()
      }

      override fun onLost(network: Network) {
        if (joined == network) joined = null
      }
    }
    joinCallback = cb
    cm.requestNetwork(request, cb, main)
    if (!latch.await(timeoutMs, TimeUnit.MILLISECONDS) || got == null) {
      leave()
      throw LocalNetworkException("ERR_P2P_JOIN", "could not join \"$ssid\"")
    }
    joined = got
    return got!!
  }

  /** The network whose subnet contains `host` (receiver on a shared LAN), or null. */
  @Suppress("DEPRECATION")
  fun networkFor(host: InetAddress): Network? {
    joined?.let { return it }
    for (n in cm.allNetworks) {
      val lp = cm.getLinkProperties(n) ?: continue
      if (lp.linkAddresses.any { la -> sameSubnet(la.address, host, la.prefixLength) }) return n
    }
    return null
  }

  private fun sameSubnet(a: InetAddress, b: InetAddress, prefix: Int): Boolean {
    val x = a.address
    val y = b.address
    if (x.size != y.size) return false
    var bits = prefix
    for (i in x.indices) {
      if (bits <= 0) return true
      val mask = if (bits >= 8) 0xff else (0xff shl (8 - bits)) and 0xff
      if ((x[i].toInt() and mask) != (y[i].toInt() and mask)) return false
      bits -= 8
    }
    return true
  }

  fun leave() {
    joinCallback?.let { runCatching { cm.unregisterNetworkCallback(it) } }
    joinCallback = null
    joined = null
  }
}
