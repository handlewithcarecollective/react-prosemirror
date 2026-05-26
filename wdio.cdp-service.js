export default class CdpService {
  async before(_caps, _specs, browser) {
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
