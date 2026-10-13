# Install Yawmi on your iPhone for free

Two free ways. No Apple Developer account, no Mac.

## Option 1: Add to Home Screen (2 minutes, never expires)

1. On your iPhone, open **Safari** (not Chrome) and go to https://mohamedhibrahim-debug.github.io/yawmi/
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
3. Open Yawmi from its new icon. It runs full screen and works offline.

Limits: alarms only ring while Yawmi is open. Voice uses Safari's speech recognition; the first time, allow the microphone.

## Option 2: The full iPhone app (about 15 minutes the first time)

This version has native alarms that ring when a wait ends even with the app closed, and Apple's speech recognition.
Apple only lets free-signed apps run for **7 days**, after which you reinstall (one minute) or let AltStore refresh it.

**Once, on this Windows PC:**

1. Install **iTunes** and **iCloud for Windows** from apple.com (not the Microsoft Store versions, if Sideloadly asks).
2. Install **Sideloadly** from https://sideloadly.io (free).

**Get the app file:**

3. Download `Yawmi-unsigned.ipa` from the latest release: https://github.com/mohamedhibrahim-debug/yawmi/releases/latest

**Install:**

4. Connect the iPhone with a cable and tap **Trust** on the phone.
5. In Sideloadly, drag in `Yawmi-unsigned.ipa`, type your normal Apple ID, and press **Start**. It signs the app with your free Apple ID.
6. On the iPhone: **Settings → General → VPN & Device Management**, tap your Apple ID, then **Trust**.
7. On iOS 16 or later, also turn on **Settings → Privacy & Security → Developer Mode**, and restart when asked.
8. Open Yawmi. Allow the microphone, speech recognition and notifications when asked.

**Every 7 days:** repeat step 5 (your data stays on the phone), or use AltStore (https://altstore.io) instead of Sideloadly to refresh automatically over Wi-Fi.

## Updating

Every push to `main` builds a new app file and updates the web version automatically.
