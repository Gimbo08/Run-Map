/* ===== Run Map — configurazione cloud (Google OAuth + Apps Script) =====
 *
 * 1. Crea un CLIENT_ID OAuth in Google Cloud Console (API e servizi →
 *    Credenziali → Crea credenziali → ID client OAuth → tipo "Applicazione
 *    web"). In "Origini JavaScript autorizzate" metti l'URL del sito
 *    (es. https://tuousername.github.io).
 * 2. Incolla qui l'ID client (termina con .apps.googleusercontent.com)
 *    e usa lo STESSO ID come proprietà CLIENT_ID nello script Apps Script.
 * 3. Pubblica lo script come Web App ("Chi ha accesso: Chiunque") e
 *    incolla qui l'URL del deployment (/exec). L'accesso ai dati è protetto
 *    dal login Google: ogni account vede e modifica solo i propri dati.
 */
const GOOGLE_CLIENT_ID = "1032131529172-r0nv5sfbua09ihd3lagaj2mkoklgdsl7.apps.googleusercontent.com";
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzWrzkiC_gwgThxwtO84DXPhy2A8Y6NbrHLUY7VN6pfNTYKbfiVPRrnOwQ-JunrNvFc/exec";
