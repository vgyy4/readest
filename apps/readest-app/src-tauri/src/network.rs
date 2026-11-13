//! Which kind of network the device is on, for "upload on Wi-Fi only".
//!
//! The web views of iOS and Android do not say whether they are on Wi-Fi or mobile data, so the
//! interfaces are looked at instead: Wi-Fi is `en0` on iOS and `wlan0` on Android, mobile data is
//! `pdp_ip0` on iOS and `rmnet*` / `ccmni*` on Android. Only an interface that is up and holds a
//! usable address counts, because the radios keep their interfaces around while off.

use tauri::command;

/// A network interface that is up and has an address that can reach the outside.
#[cfg(any(target_os = "ios", target_os = "android", test))]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActiveInterface {
    pub name: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Wifi,
    Cellular,
    None,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Wifi => "wifi",
            Kind::Cellular => "cellular",
            Kind::None => "none",
        }
    }
}

/// Interfaces that are never the way out to the internet: loopback, VPNs, Apple's peer-to-peer
/// links, bridges and a phone's own hotspot.
fn is_ignored(name: &str) -> bool {
    const IGNORED: [&str; 14] = [
        "lo", "utun", "awdl", "llw", "bridge", "ap", "swlan", "dummy", "tun", "tap", "p2p",
        "ipsec", "gif", "stf",
    ];
    IGNORED.iter().any(|prefix| name.starts_with(prefix))
}

fn is_cellular(name: &str) -> bool {
    ["pdp_ip", "rmnet", "ccmni", "v4-rmnet", "wwan", "ppp"]
        .iter()
        .any(|prefix| name.starts_with(prefix))
}

fn is_wifi_or_wired(name: &str) -> bool {
    ["en", "wlan", "eth", "wifi"]
        .iter()
        .any(|prefix| name.starts_with(prefix))
}

/// Wi-Fi (or a wired link, which is as good) wins over mobile data when both are up, because the
/// system sends traffic over Wi-Fi then.
pub fn classify<'a>(names: impl IntoIterator<Item = &'a str>) -> Kind {
    let mut cellular = false;
    for name in names {
        if is_ignored(name) {
            continue;
        }
        if is_cellular(name) {
            cellular = true;
        } else if is_wifi_or_wired(name) {
            return Kind::Wifi;
        }
    }
    if cellular {
        Kind::Cellular
    } else {
        Kind::None
    }
}

#[cfg(any(target_os = "ios", target_os = "android"))]
fn active_interfaces() -> Vec<ActiveInterface> {
    use std::ffi::CStr;
    use std::net::{Ipv4Addr, Ipv6Addr};

    let mut found = Vec::new();
    let mut head: *mut libc::ifaddrs = std::ptr::null_mut();
    // SAFETY: getifaddrs fills `head` with a list that freeifaddrs releases; every pointer read
    // below is checked for null first and only read while the list is alive.
    unsafe {
        if libc::getifaddrs(&mut head) != 0 {
            return found;
        }
        let mut cursor = head;
        while !cursor.is_null() {
            let entry = &*cursor;
            cursor = entry.ifa_next;
            let flags = entry.ifa_flags as libc::c_int;
            if flags & libc::IFF_UP == 0 || flags & libc::IFF_LOOPBACK != 0 {
                continue;
            }
            if entry.ifa_addr.is_null() || entry.ifa_name.is_null() {
                continue;
            }
            let usable = match (*entry.ifa_addr).sa_family as libc::c_int {
                libc::AF_INET => {
                    let addr = &*(entry.ifa_addr as *const libc::sockaddr_in);
                    let ip = Ipv4Addr::from(u32::from_be(addr.sin_addr.s_addr));
                    !ip.is_loopback() && !ip.is_link_local() && !ip.is_unspecified()
                }
                libc::AF_INET6 => {
                    let addr = &*(entry.ifa_addr as *const libc::sockaddr_in6);
                    let ip = Ipv6Addr::from(addr.sin6_addr.s6_addr);
                    let link_local = (ip.segments()[0] & 0xffc0) == 0xfe80;
                    !ip.is_loopback() && !link_local && !ip.is_unspecified()
                }
                _ => false,
            };
            if usable {
                if let Ok(name) = CStr::from_ptr(entry.ifa_name).to_str() {
                    found.push(ActiveInterface {
                        name: name.to_string(),
                    });
                }
            }
        }
        libc::freeifaddrs(head);
    }
    found
}

/// `"wifi"`, `"cellular"`, `"none"` — or `"unknown"` where this cannot be told (desktop), which
/// the app treats as "do not hold anything back".
#[command]
pub fn network_kind() -> &'static str {
    #[cfg(any(target_os = "ios", target_os = "android"))]
    {
        let interfaces = active_interfaces();
        classify(interfaces.iter().map(|i| i.name.as_str())).as_str()
    }
    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    {
        "unknown"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wifi_on_an_ipad_or_iphone() {
        assert_eq!(classify(["lo0", "en0"]), Kind::Wifi);
    }

    #[test]
    fn wifi_wins_when_mobile_data_is_up_too() {
        assert_eq!(classify(["pdp_ip0", "en0"]), Kind::Wifi);
        assert_eq!(classify(["rmnet_data1", "wlan0"]), Kind::Wifi);
    }

    #[test]
    fn mobile_data_alone() {
        assert_eq!(classify(["lo0", "pdp_ip0"]), Kind::Cellular);
        assert_eq!(classify(["lo", "rmnet_data2", "ccmni1"]), Kind::Cellular);
        assert_eq!(classify(["v4-rmnet_data0"]), Kind::Cellular);
    }

    #[test]
    fn nothing_usable_is_none() {
        let none: [&str; 0] = [];
        assert_eq!(classify(none), Kind::None);
        assert_eq!(classify(["lo0"]), Kind::None);
    }

    #[test]
    fn vpns_hotspots_and_peer_links_do_not_count_as_wifi() {
        assert_eq!(
            classify(["utun3", "awdl0", "llw0", "bridge100"]),
            Kind::None
        );
        assert_eq!(classify(["swlan0", "ap0"]), Kind::None);
        assert_eq!(classify(["pdp_ip0", "utun2", "awdl0"]), Kind::Cellular);
    }

    #[test]
    fn names_for_the_command() {
        assert_eq!(Kind::Wifi.as_str(), "wifi");
        assert_eq!(Kind::Cellular.as_str(), "cellular");
        assert_eq!(Kind::None.as_str(), "none");
    }
}
