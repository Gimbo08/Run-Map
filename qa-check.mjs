// Verifica post-pulizia: carica index.html con un token JWT finto (scadenza lontana)
// e controlla che mappa, PB card, lista gare e modal di aggiunta gare manuale funzionino.
export default async function run(page) {
  const fakeToken = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ email: "test@test.it", name: "Test", exp: 4102444800 })).toString("base64url"),
    "firma-finta"
  ].join(".");
  await page.addInitScript(t => sessionStorage.setItem("runmap:idToken", t), fakeToken);
  await page.goto("http://localhost:3000/index.html");
  await page.waitForSelector("#map", { timeout: 10000 });

  const out = {
    title: await page.title(),
    mapExists: await page.locator("#map").count(),
    leafletLoaded: await page.evaluate(() => typeof L !== "undefined" && !!L.map),
    raceRows: await page.locator(".race-row").count(),
    pbCards: await page.locator(".pb-card").count(),
    manualBtn: await page.locator("#toggleManualBtn").count(),
    authVisible: await page.locator("#authBox").isVisible()
  };

  // apri il pannello "Aggiungi gara manuale"
  await page.click("#toggleManualBtn");
  await page.waitForTimeout(200);
  out.manualCardVisible = await page.locator("#manualCard").isVisible();
  await page.click("#toggleManualBtn");

  // apri il primo modal gara se esiste una riga
  const rows = await page.locator(".race-row").count();
  if (rows) {
    await page.locator(".race-row").first().click();
    await page.waitForTimeout(300);
    out.modalOpen = await page.evaluate(() => !document.getElementById("modal").hidden);
    out.modalHasKm = await page.locator("#kmField").count();
  }
  return out;
}
