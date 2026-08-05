use serde::Serialize;

const TORRENTORY_BUNDLE_ID: &str = "com.torrentory.client";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultClientStatus {
    pub supported: bool,
    pub is_default: bool,
    pub current_handler: Option<String>,
}

#[cfg(target_os = "macos")]
mod platform {
    use super::{DefaultClientStatus, TORRENTORY_BUNDLE_ID};
    use core_foundation::{base::TCFType, string::CFString};
    use core_foundation_sys::string::CFStringRef;

    type LSRolesMask = u32;
    type OSStatus = i32;

    const K_LS_ROLES_ALL: LSRolesMask = u32::MAX;
    const TORRENT_TYPES: [&str; 2] = ["org.bittorrent.torrent", "com.torrentory.torrent-file"];

    #[link(name = "CoreServices", kind = "framework")]
    unsafe extern "C" {
        fn LSCopyDefaultRoleHandlerForContentType(
            content_type: CFStringRef,
            role: LSRolesMask,
        ) -> CFStringRef;
        fn LSSetDefaultRoleHandlerForContentType(
            content_type: CFStringRef,
            role: LSRolesMask,
            handler_bundle_id: CFStringRef,
        ) -> OSStatus;
    }

    fn handler_for(content_type: &str) -> Option<String> {
        let content_type = CFString::new(content_type);
        let handler = unsafe {
            LSCopyDefaultRoleHandlerForContentType(
                content_type.as_concrete_TypeRef(),
                K_LS_ROLES_ALL,
            )
        };
        if handler.is_null() {
            return None;
        }
        let handler = unsafe { CFString::wrap_under_create_rule(handler) };
        Some(handler.to_string())
    }

    pub fn status() -> DefaultClientStatus {
        let standard_handler = handler_for(TORRENT_TYPES[0]);
        let torrentory_handler = handler_for(TORRENT_TYPES[1]);
        let current_handler = standard_handler.clone().or(torrentory_handler.clone());
        let is_default = standard_handler
            .as_deref()
            .or(torrentory_handler.as_deref())
            == Some(TORRENTORY_BUNDLE_ID);

        DefaultClientStatus {
            supported: true,
            is_default,
            current_handler,
        }
    }

    pub fn make_default() -> Result<DefaultClientStatus, String> {
        let handler = CFString::new(TORRENTORY_BUNDLE_ID);
        for torrent_type in TORRENT_TYPES {
            let torrent_type = CFString::new(torrent_type);
            let result = unsafe {
                LSSetDefaultRoleHandlerForContentType(
                    torrent_type.as_concrete_TypeRef(),
                    K_LS_ROLES_ALL,
                    handler.as_concrete_TypeRef(),
                )
            };
            if result != 0 {
                return Err(format!(
                    "macOS could not set Torrentory as the default client (error {result})"
                ));
            }
        }

        let status = status();
        if status.is_default {
            Ok(status)
        } else {
            Err("macOS did not accept the default-client change".into())
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::DefaultClientStatus;

    pub fn status() -> DefaultClientStatus {
        DefaultClientStatus {
            supported: false,
            is_default: false,
            current_handler: None,
        }
    }

    pub fn make_default() -> Result<DefaultClientStatus, String> {
        Err("Changing the default torrent client is currently supported on macOS only".into())
    }
}

pub use platform::{make_default, status};
