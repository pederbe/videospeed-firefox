import assert from "node:assert/strict";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { Builder } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";

const root = resolve(import.meta.dirname, "..");
let driver, server, origin, temporary, optionsUrl;

// A short silent PCM recording exercises native media loading and seeking.
const recording = Buffer.alloc(44 + 8000 * 2 * 10);
recording.write("RIFF", 0);
recording.writeUInt32LE(recording.length - 8, 4);
recording.write("WAVEfmt ", 8);
recording.writeUInt32LE(16, 16);
recording.writeUInt16LE(1, 20);
recording.writeUInt16LE(1, 22);
recording.writeUInt32LE(8000, 24);
recording.writeUInt32LE(16000, 28);
recording.writeUInt16LE(2, 32);
recording.writeUInt16LE(16, 34);
recording.write("data", 36);
recording.writeUInt32LE(recording.length - 44, 40);

before(async () => {
  temporary = await mkdtemp(join(tmpdir(), "videospeed-test-"));
  const extension = join(temporary, "extension");
  for (const file of await readdir(root)) {
    if (
      /\.(js|css|html)$/.test(file) ||
      ["manifest.json", "icons"].includes(file)
    ) {
      await cp(join(root, file), join(extension, file), { recursive: true });
    }
  }
  server = createServer((request, response) => {
    if (request.url.endsWith(".wav")) {
      response.writeHead(200, { "Content-Type": "audio/wav" }).end(recording);
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html" }).end();
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${server.address().port}`;
  driver = await new Builder()
    .forBrowser("firefox")
    .setFirefoxService(
      new firefox.ServiceBuilder().addArguments(
        "--allow-system-access",
        "--profile-root",
        temporary
      )
    )
    .setFirefoxOptions(
      new firefox.Options()
        .addArguments("-headless")
        .setPreference("media.autoplay.default", 0)
    )
    .build();
  await driver.installWebExtension(extension, { permanent: false });
});

after(async () => {
  await driver?.quit();
  if (server) await new Promise((done) => server.close(done));
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

async function loadVideo() {
  await driver.get(origin);
  await driver.wait(
    () =>
      driver.executeScript(
        "return document.body.classList.contains('vsc-initialized')"
      ),
    5000
  );
  await driver.executeScript(() => {
    const video = document.createElement("video");
    video.id = "video";
    video.muted = true;
    video.src = "/video.wav";
    document.body.append(video);
  });
  await driver.wait(
    () =>
      driver.executeScript(
        "return !!document.querySelector('.vsc-controller') && document.querySelector('video').readyState >= 1"
      ),
    5000
  );
}

async function configure(settings) {
  await driver.setContext("chrome");
  await driver.executeScript((url) => {
    gBrowser.selectedBrowser.loadURI(Services.io.newURI(url), {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()
    });
  }, optionsUrl);
  await driver.setContext("content");
  await driver.wait(
    () => driver.executeScript("return !!window.chrome?.storage"),
    5000
  );
  await driver.executeAsyncScript((settings, done) => {
    chrome.storage.sync.set(settings, done);
  }, settings);
  await loadVideo();
}

beforeEach(async () => {
  if (!optionsUrl) {
    await loadVideo();
    optionsUrl = await driver.executeScript(() => {
      const css = document
        .querySelector(".vsc-controller")
        .shadowRoot.querySelector("style").textContent;
      return css.match(/moz-extension:\/\/[^/]+\//)[0] + "options.html";
    });
  }
  await configure({
    rememberSpeed: false,
    forceLastSavedSpeed: false,
    lastSpeed: 1
  });
});

for (const event of ["play", "seeked"]) {
  test(`${event} does not undo a speed selected in the same task`, async () => {
    const result = await driver.executeScript((event) => {
      document.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 71 }));
      const video = document.querySelector("video");
      const selected = video.playbackRate;
      video.dispatchEvent(new Event(event));
      return { selected, actual: video.playbackRate };
    }, event);
    assert.equal(result.selected, 1.8);
    assert.equal(result.actual, result.selected);
  });
}

for (const event of ["play", "seeked"]) {
  test(`${event} does not restore an older, faster speed`, async () => {
    await driver.executeScript(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 71 }));
    });
    await driver.wait(
      () =>
        driver.executeScript(
          "return document.querySelector('.vsc-controller').shadowRoot.querySelector('span').textContent === '1.80'"
        ),
      5000
    );
    const result = await driver.executeScript((event) => {
      const video = document.querySelector("video");
      document.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 82 }));
      const selected = video.playbackRate;
      video.dispatchEvent(new Event(event));
      return { selected, actual: video.playbackRate };
    }, event);
    assert.equal(result.selected, 1);
    assert.equal(result.actual, result.selected);
  });
}

test("forced speed survives a source replacement and resume", async () => {
  await configure({ forceLastSavedSpeed: true });
  await driver.executeScript(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 71 }));
    const video = document.querySelector("video");
    video.src = "/replacement.wav";
    video.load();
  });
  await driver.wait(
    () =>
      driver.executeScript(
        "return document.querySelector('video').currentSrc.endsWith('/replacement.wav') && document.querySelector('video').readyState >= 1"
      ),
    5000
  );
  const result = await driver.executeAsyncScript((done) => {
    const video = document.querySelector("video");
    video.play().then(
      () => {
        video.pause();
        done(video.playbackRate);
      },
      (error) => done(error.message)
    );
  });
  assert.equal(result, 1.8);
});

test("removed videos no longer react to seek events", async () => {
  await driver.executeScript(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 71 }));
    window.detachedVideo = document.querySelector("video");
    window.detachedVideo.remove();
  });
  await driver.wait(
    () =>
      driver.executeScript("return !document.querySelector('.vsc-controller')"),
    5000
  );
  const rate = await driver.executeScript(() => {
    window.detachedVideo.playbackRate = 1;
    window.detachedVideo.dispatchEvent(new Event("seeked"));
    return window.detachedVideo.playbackRate;
  });
  assert.equal(rate, 1);
});

for (const force of [false, true]) {
  test(`page speed changes are ${force ? "reverted" : "accepted"} when forcing is ${force}`, async () => {
    await configure({ forceLastSavedSpeed: force });
    await driver.executeScript(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 71 }));
    });
    const speed = await driver.executeAsyncScript((done) => {
      const video = document.querySelector("video");
      video.playbackRate = 1.25;
      setTimeout(() => done(video.playbackRate), 100);
    });
    assert.equal(speed, force ? 1.8 : 1.25);
  });
}

for (const remember of [false, true]) {
  for (const force of [false, true]) {
    test(`initial saved speed with remember=${remember} and force=${force}`, async () => {
      await configure({
        rememberSpeed: remember,
        forceLastSavedSpeed: force,
        lastSpeed: 1.6
      });
      const speed = await driver.executeAsyncScript((done) => {
        const video = document.querySelector("video");
        video.play().then(
          () => {
            video.pause();
            done(video.playbackRate);
          },
          (error) => done(error.message)
        );
      });
      assert.equal(speed, remember || force ? 1.6 : 1);
    });
  }
}

test("native pause, resume and seeking preserve the selected speed", async () => {
  await driver.executeScript(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { keyCode: 71 }));
  });
  const speeds = await driver.executeAsyncScript(async (done) => {
    const video = document.querySelector("video");
    try {
      await video.play();
      video.pause();
      // Exercise a pause beyond the extension's one-second event cooldown.
      await new Promise((resolve) => setTimeout(resolve, 1100));
      await video.play();
      video.pause();
      const resumed = video.playbackRate;
      const sought = new Promise((resolve) =>
        video.addEventListener("seeked", resolve, { once: true })
      );
      video.currentTime = 5;
      await sought;
      done([resumed, video.playbackRate]);
    } catch (error) {
      done(error.message);
    }
  });
  assert.deepEqual(speeds, [1.8, 1.8]);
});
