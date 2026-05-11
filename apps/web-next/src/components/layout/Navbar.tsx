'use client';

import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Disclosure, Menu, Transition } from "@headlessui/react";
import { Bars3Icon, WalletIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/auth/AuthProvider";
import { useUserSettings } from "@/user-settings/UserSettingsProvider";
import UserAvatar from "@/components/user/UserAvatar";

type NavItem = {
  href: string;
  label: string;
  matches: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/explore",
    label: "Explore Cards",
    matches: (pathname) => pathname === "/explore" || pathname.startsWith("/explore/"),
  },
  {
    href: "/check-odds",
    label: "Check Odds",
    matches: (pathname) => pathname === "/check-odds" || pathname.startsWith("/check-odds/"),
  },
  {
    href: "/news",
    label: "Card News",
    matches: (pathname) => pathname === "/news" || pathname.startsWith("/news/"),
  },
  {
    href: "/card-wire",
    label: "Card Wire",
    matches: (pathname) => pathname === "/card-wire" || pathname.startsWith("/card-wire/"),
  },
  {
    href: "/best",
    label: "Best Cards",
    matches: (pathname) => pathname === "/best" || pathname.startsWith("/best/"),
  },
];

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function DesktopNavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={classNames(
        "inline-flex h-full items-center px-0.5 text-[14px] font-medium tracking-[-0.01em] transition-all",
        active
          ? "font-semibold text-[#1a1330] [box-shadow:inset_0_-2px_0_0_#6d3fe8]"
          : "text-[#3a2f55] hover:text-[#1a1330] hover:[box-shadow:inset_0_-1px_0_0_#1a1330]"
      )}
    >
      {label}
    </Link>
  );
}

function MobileNavLink({
  href,
  label,
  active,
  onClick,
}: {
  href: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={classNames(
        "block rounded-[3px] border px-4 py-3 text-sm font-medium transition-colors",
        active
          ? "border-[#ddd7ec] bg-[#f7f5fc] text-[#1a1330] [box-shadow:inset_3px_0_0_0_#6d3fe8]"
          : "border-transparent text-[#3a2f55] hover:border-[#ece8f5] hover:bg-[#f7f5fc] hover:text-[#1a1330]"
      )}
    >
      {label}
    </Link>
  );
}

export default function Navbar() {
  const { authState, logout } = useAuth();
  const { settings } = useUserSettings();
  const pathname = usePathname();
  // Hold the avatar render until /user-settings has resolved so we don't
  // briefly show the UID-seeded fallback and then snap to the user's saved
  // seed (avatar flicker). settings === null means the GET hasn't returned
  // yet; once it has, we either use the saved avatar_seed or fall back to
  // the UID for users who haven't customised.
  const settingsLoaded = settings !== null;
  const avatarSeed = settingsLoaded
    ? settings.avatar_seed ?? authState.user?.uid ?? authState.user?.email ?? null
    : null;

  const isActive = (item: NavItem) => item.matches(pathname);
  const isProfileActive = pathname === "/profile" || pathname.startsWith("/profile/");

  return (
    <Disclosure
      as="nav"
      className="sticky top-0 z-40 border-b border-[#ece8f5] bg-[rgba(255,255,255,0.85)] backdrop-blur-[10px]"
    >
      {({ open, close }) => (
        <>
          <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
            <div className="flex h-14 items-stretch justify-between gap-3 sm:h-16 lg:gap-6">
              <div className="flex min-w-0 items-stretch gap-3 lg:gap-6">
                <div className="flex shrink-0 items-center">
                  <Link href="/" aria-label="CreditOdds home" className="inline-flex items-center">
                    <Image
                      className="h-10 w-auto sm:h-12"
                      src="/assets/CreditOdds_LogoText_with Icon-01.svg"
                      alt="CreditOdds"
                      width={150}
                      height={48}
                      priority
                    />
                  </Link>
                </div>

                <div className="hidden lg:flex items-stretch gap-5 lg:gap-[22px]">
                  {NAV_ITEMS.map((item) => (
                    <DesktopNavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      active={isActive(item)}
                    />
                  ))}
                </div>
              </div>

              <div className="hidden lg:flex items-center gap-2 lg:gap-3">
                {authState.isAuthenticated ? (
                  <>
                    <Link
                      href="/profile"
                      className={classNames(
                        "inline-flex h-9 items-center gap-2 rounded-[3px] px-4 text-[13px] font-semibold tracking-[-0.005em] transition-colors",
                        isProfileActive
                          ? "bg-[#3a2f55] text-white"
                          : "bg-[#1a1330] text-white hover:bg-[#3a2f55]"
                      )}
                    >
                      <WalletIcon className="h-[16px] w-[16px]" aria-hidden="true" />
                      Wallet
                    </Link>

                    <Menu as="div" className="relative z-10 flex items-center">
                      {({ open: menuOpen }) => (
                        <>
                          <Menu.Button className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-[3px] border border-[#ddd7ec] bg-white p-0 text-sm transition-colors hover:border-[#1a1330] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6d3fe8] focus-visible:ring-offset-2">
                            <span className="sr-only">Open user menu</span>
                            {settingsLoaded && (
                              <span key={avatarSeed ?? 'guest'} className="cj-avatar-fade-in">
                                <UserAvatar
                                  seed={avatarSeed}
                                  size={32}
                                  title="Account menu"
                                />
                              </span>
                            )}
                          </Menu.Button>
                          <Transition
                            show={menuOpen}
                            as={Fragment}
                            enter="transition ease-out duration-150"
                            enterFrom="scale-95 opacity-0"
                            enterTo="scale-100 opacity-100"
                            leave="transition ease-in duration-100"
                            leaveFrom="scale-100 opacity-100"
                            leaveTo="scale-95 opacity-0"
                          >
                            <Menu.Items
                              static
                              className="absolute right-0 mt-2 w-48 origin-top-right rounded-[4px] border border-[#ece8f5] bg-white p-1.5 shadow-lg focus:outline-none"
                            >
                              <Menu.Item>
                                {({ active }) => (
                                  <Link
                                    href="/profile"
                                    className={classNames(
                                      "block rounded-[3px] px-3 py-2 text-sm text-[#3a2f55] transition-colors",
                                      active && "bg-[#f7f5fc] text-[#1a1330]"
                                    )}
                                  >
                                    Profile
                                  </Link>
                                )}
                              </Menu.Item>
                              <Menu.Item>
                                {({ active }) => (
                                  <button
                                    onClick={logout}
                                    className={classNames(
                                      "block w-full rounded-[3px] px-3 py-2 text-left text-sm text-[#3a2f55] transition-colors",
                                      active && "bg-[#f7f5fc] text-[#1a1330]"
                                    )}
                                  >
                                    Sign Out
                                  </button>
                                )}
                              </Menu.Item>
                            </Menu.Items>
                          </Transition>
                        </>
                      )}
                    </Menu>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="inline-flex items-center rounded-[3px] border border-[#ddd7ec] bg-white px-4 py-2 text-[13px] font-semibold tracking-[-0.005em] text-[#1a1330] transition-colors hover:border-[#1a1330]"
                    >
                      Sign In
                    </Link>
                    <Link
                      href="/register"
                      className="inline-flex items-center rounded-[3px] border border-[#1a1330] bg-[#1a1330] px-4 py-2 text-[13px] font-semibold tracking-[-0.005em] text-white transition-colors hover:bg-[#3a2f55] hover:border-[#3a2f55]"
                    >
                      Sign Up
                    </Link>
                  </>
                )}
              </div>

              <div className="flex items-center lg:hidden">
                <Disclosure.Button className="inline-flex h-9 w-9 items-center justify-center rounded-[3px] border border-[#ddd7ec] bg-white text-[#1a1330] transition-colors hover:border-[#1a1330] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6d3fe8] focus-visible:ring-offset-2">
                  <span className="sr-only">Open main menu</span>
                  {open ? (
                    <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Bars3Icon className="h-5 w-5" aria-hidden="true" />
                  )}
                </Disclosure.Button>
              </div>
            </div>
          </div>

          <Disclosure.Panel className="max-h-[calc(100vh-3.5rem)] overflow-y-auto border-t border-[#ece8f5] bg-[rgba(255,255,255,0.97)] px-4 pb-4 pt-3 lg:hidden">
            <div className="space-y-2">
              {NAV_ITEMS.map((item) => (
                <MobileNavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={isActive(item)}
                  onClick={() => close()}
                />
              ))}
            </div>

            <div className="mt-4 rounded-[3px] border border-[#ece8f5] bg-white p-3">
              {authState.isAuthenticated ? (
                <div className="space-y-2">
                  <Link
                    href="/profile"
                    onClick={() => close()}
                    className={classNames(
                      "flex items-center gap-2 rounded-[3px] px-4 py-3 text-sm font-semibold transition-colors",
                      isProfileActive
                        ? "bg-[#3a2f55] text-white"
                        : "bg-[#1a1330] text-white hover:bg-[#3a2f55]"
                    )}
                  >
                    <WalletIcon className="h-5 w-5" aria-hidden="true" />
                    Wallet
                  </Link>
                  <button
                    onClick={() => {
                      close();
                      logout();
                    }}
                    className="block w-full rounded-[3px] border border-[#ddd7ec] px-4 py-3 text-left text-sm font-medium text-[#1a1330] transition-colors hover:border-[#1a1330]"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Link
                    href="/login"
                    onClick={() => close()}
                    className="block rounded-[3px] border border-[#ddd7ec] px-4 py-3 text-sm font-semibold text-[#1a1330] transition-colors hover:border-[#1a1330]"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => close()}
                    className="block rounded-[3px] border border-[#1a1330] bg-[#1a1330] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#3a2f55] hover:border-[#3a2f55]"
                  >
                    Sign Up
                  </Link>
                </div>
              )}
            </div>
          </Disclosure.Panel>
        </>
      )}
    </Disclosure>
  );
}
