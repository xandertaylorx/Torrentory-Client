const paths = {
  send: <path d="M4.5 12h13M12.5 6l6 6-6 6" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></>,
  micOff: <><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 10V6a3 3 0 0 0-5.7-1.3" /><path d="M5.5 11a6.5 6.5 0 0 0 10.8 4.9M18.5 11a6.4 6.4 0 0 1-.6 2.6M12 17.5V21M3 3l18 18" /></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="M20.5 16l-5-5-9 8.5" /></>,
  phone: <path d="M6.6 3.5h2.6l1.6 4.2-2 1.4a11 11 0 0 0 6.1 6.1l1.4-2 4.2 1.6v2.6a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 4.6 5.6a2 2 0 0 1 2-2.1z" />,
  phoneDown: <path d="M3.2 14.8l-.4-2.1c3.9-3.6 14.5-3.6 18.4 0l-.4 2.1-3.9.9-.9-2.3a11 11 0 0 0-8 0l-.9 2.3z" />,
  video: <><rect x="3" y="6" width="12.5" height="12" rx="3" /><path d="M15.5 10.5l5.5-3.2v9.4l-5.5-3.2" /></>,
  videoOff: <><path d="M15.5 11V9a3 3 0 0 0-3-3H8.6M3.9 6.8A3 3 0 0 0 3 9v6a3 3 0 0 0 3 3h6.5a3 3 0 0 0 2.4-1.2M15.5 10.5l5.5-3.2v9.4l-3-1.7M3 3l18 18" /></>,
  screen: <><rect x="3" y="4" width="18" height="12.5" rx="2.5" /><path d="M8.5 20.5h7M12 16.5v4M12 13V7.5M9.5 10l2.5-2.5 2.5 2.5" /></>,
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />,
  pause: <><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none" /><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none" /></>,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor" stroke="none" />,
  trash: <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  reply: <path d="M9.5 6L4 11.5 9.5 17M4.5 11.5h9a6.5 6.5 0 0 1 6.5 6.5v.5" />,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6.5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></>,
  smile: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  shield: <><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" /><path d="M8.8 12.2l2.2 2.2 4.3-4.6" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  users: <><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 19.5a6.5 6.5 0 0 1 13 0M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.2a6.5 6.5 0 0 1 3.5 5.3" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h10" />,
  flame: <path d="M12 21a6.5 6.5 0 0 1-6.5-6.5c0-3.8 3-5.7 3.6-9.5 2.3 1.4 3.4 3.4 3.4 5 1-.6 1.7-1.7 1.9-3 2 1.6 4.1 4.3 4.1 7.5A6.5 6.5 0 0 1 12 21z" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a17.4 17.4 0 0 1-2.6 3.4M6.3 6.8C3.9 8.5 2.5 12 2.5 12S6 18.5 12 18.5c1.7 0 3.2-.5 4.5-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  checks: <path d="M2.5 12.5L7 17l9.5-9.5M12.5 16l1 1L23 7.5" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  minimize: <path d="M9 4v5H4M15 20v-5h5M4 9l5-5M20 15l-5 5" />,
  expand: <path d="M15 4h5v5M9 20H4v-5M20 4l-6 6M4 20l6-6" />,
  edit: <path d="M14.5 5.5l4 4M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 0l.5.5a2.1 2.1 0 0 1 0 3L8.5 19z" />,
  upload: <path d="M12 15V4.5M7.5 9L12 4.5 16.5 9M4.5 15v2.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15" />,
  sparkle: <path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2-5.2-1.8 5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />,
  text: <path d="M4.5 7V5h15v2M12 5v14M9 19h6" />,
  qr: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  more: <><circle cx="5.5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="18.5" cy="12" r="1.3" fill="currentColor" /></>,
  save: <><path d="M12 4v10M8 10.5l4 4 4-4" /><path d="M5 15.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2.5" /></>,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  back: <path d="M15 5l-7 7 7 7" />,
};

export function Icon({ name, size = 20, className = '', ...rest }) {
  return (
    <svg className={`ic ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {paths[name]}
    </svg>
  );
}
