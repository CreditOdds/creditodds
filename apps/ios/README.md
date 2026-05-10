# CreditOdds iOS

SwiftUI iOS app porting the web `/profile` section.

## First-time setup

Prereqs: Xcode 26+, Homebrew.

```bash
brew install xcodegen     # if not already installed
cd apps/ios
xcodegen                  # generates CreditOdds.xcodeproj from project.yml
```

### Add Firebase config

The app needs `GoogleService-Info.plist` from the Firebase console:

1. Firebase Console → Project Settings → **Add iOS app**
2. Bundle ID: `com.creditodds.app`
3. Download `GoogleService-Info.plist`
4. Drop it into `apps/ios/CreditOdds/Resources/`
5. Re-run `xcodegen` so it gets bundled

### Set the signing team

`project.yml` leaves `DEVELOPMENT_TEAM` empty. Either:

- Open `CreditOdds.xcodeproj` once in Xcode → select the target → Signing & Capabilities → pick your team. Xcode writes it into `project.pbxproj`, but `xcodegen` will overwrite it next time.
- Better: add your team ID to `project.yml` under `settings.base.DEVELOPMENT_TEAM`.

## Build & run

```bash
xcodegen
open CreditOdds.xcodeproj
```

Then ⌘R in Xcode, or headless:

```bash
xcodebuild -project CreditOdds.xcodeproj \
  -scheme CreditOdds \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  build
```

## Project layout

```
CreditOdds/
  CreditOddsApp.swift      @main entry, FirebaseApp.configure()
  Info.plist
  Models/                  Card, WalletCard
  Services/                APIClient, AuthService, WalletService, CardService
  ViewModels/              AuthViewModel, WalletViewModel
  Views/
    RootView.swift         Auth gate
    LoginView.swift        Email-link sign-in
    ProfileView.swift      Tab container
    Tabs/
      WalletTab.swift      "Cards" tab — first port of the web profile
      SettingsTab.swift
  Resources/
    GoogleService-Info.plist  ← add this manually (gitignored)
```

## What's ported so far

- Email-link sign-in (matches the web `AuthProvider`)
- `/wallet` GET + DELETE → "Cards" tab list with pull-to-refresh and swipe-to-delete

## Not yet ported

Rewards, Benefits, Applications (records), Referrals, News, More tabs. The
Wallet tab is the headline; the rest follow the same pattern (a service file,
a view model, a SwiftUI view) and can be added incrementally.

## Universal Links / email-link sign-in

The sign-in link Firebase sends opens `https://creditodds.com/login`. To make
it open the iOS app instead:

1. Add Associated Domains capability with `applinks:creditodds.com`.
2. Host an `apple-app-site-association` JSON at `https://creditodds.com/.well-known/apple-app-site-association` mapping `/login` to this app's bundle ID + team ID.
3. The `RootView.onOpenURL` handler is already wired up.

Until that's done, the link opens in Safari and Firebase finishes sign-in
on the web. Add the AASA file in the web-next public dir when ready.
