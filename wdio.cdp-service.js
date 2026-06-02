export default class CdpService {
  async before(caps, _specs, browser) {
    // CDP (and puppeteer) is only available in Chromium-based browsers.
    // getPuppeteer() throws in Firefox, so skip registration there.
    if (caps.browserName !== "chrome") {
      return;
    }

    const puppeteer = await browser.getPuppeteer();
    const [page] = await puppeteer.pages();
    const cdp = await page.target().createCDPSession();

    browser.addCommand("imeSetComposition", async (params) => {
      return cdp.send("Input.imeSetComposition", params);
    });
    browser.addCommand("imeInsertText", async (params) => {
      return cdp.send("Input.insertText", params);
    });
  }
}
