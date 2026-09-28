export const AUTH_KEY = "vydelkomat_auth_v1";
// Heslo držíme v localStorage (přetrvá i po zavření PWA), posílá se jako bearer token na /api.
export const AUTH_PW_KEY = "vydelkomat_pw_v1";

export function logout(): void {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(AUTH_PW_KEY);
  window.location.reload();
}
