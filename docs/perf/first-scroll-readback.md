# Scrolling while another frame reads a canvas

On an Apple M4 with a 60 Hz display, a cold visit to the public Hugging Face homepage showed a 154 ms pause during an early scroll, over two seconds after the native loading mesh was gone. Native wheel events kept arriving about every 17 ms. A separate iframe read pixels from a canvas, Chromium's main GPU thread spent 139 ms flushing its drawing commands, and the window didn't present another page frame until the flush finished. The earlier 499 ms incident was captured without a GPU trace and can't be attributed with the same confidence.

The [offline fixture](../../apps/browser/scripts/perf/canvas-scroll-repro.mjs) exercises the same mechanism using a print preview drawn in a cross-site iframe. It uses only loopback connections. Run `node apps/browser/scripts/perf/canvas-scroll-repro.mjs dense`, open the printed URL in a disposable browser, and scroll for at least a second. A second scroll in that document has no preview work. `window.previewResult` contains the drawing time and a sample of the output. Reload for another first gesture. The `frequent` argument requests a 2D context optimized for readback in the fixture; Voyager does not change how websites create canvases.

These are alternating runs on fresh profiles with hardware acceleration active. Input was a native 60 Hz trackpad gesture moving the parent page 400 CSS pixels. The viewport stayed at 901 × 722. The table lists individual trials; GPU flush time is shown separately so a warm shader cache isn't mistaken for smoother presentation.

| Dense preview | GPU flush (ms) | Longest gap in visibly moving window pixels (ms) | Missed display refreshes, as reported by Chromium |
| --- | ---: | ---: | ---: |
| Default A | 91 | 130 | 7 |
| Separate display compositor A | 92 | 101 | 5 |
| Default B | 82 | 101 | 6 |
| Separate display compositor B | 92 | 37 | 0 |

With a smaller preview and matched 40–49 ms flushes, the worst interval between presented scroll updates was 50–51 ms in two default runs and 33–34 ms in three runs with the separate compositor. The dense trials' eight static controls had no Chromium-classified scroll jank. Standalone Chrome for Testing 156 also stalled on the preview. A separate 120 ms JavaScript task delayed that browser's page callbacks but left visible motion at intervals of 20 ms or less. Page animation callbacks alone don't measure whether scrolling stalls.

Voyager enables Chromium's `EnableDrDc` on macOS, leaving [backend eligibility](https://chromium.googlesource.com/chromium/src/+/4fa6513a781a593cd2cd3851586bb75368a73bd4) to Chromium. This moves display composition to a separate GPU thread; it doesn't give the window a separate GPU. Heavy work can still interrupt scrolling. To repeat the A/B on the same build, use the hidden launch harness's Chromium switches to explicitly enable or disable this feature in separate disposable profiles. A meaningful comparison checks `SystemInfo.getInfo` for the effective feature, the renderer's `PresentedFrameInformation` and `ScrollJankV4` events, and the duration of `RasterDecoderImpl::DoEndRasterCHROMIUM::Flush` on the GPU main thread.

On a cold follow-up visit to the public homepage with both changes, the same iframe performed a 171 ms GPU readback during the first scroll. The captured window advanced six times during that readback. The longest visible-motion gap over the whole gesture was 37 ms, versus 154 ms during a 142 ms readback in the earlier trace. These were independent live visits. The matching-work offline trials above are the control.

The trace also identified a separate cost in Voyager's loading mesh: the first color sample created a canvas command buffer even on a page drawn entirely with CSS. On the local twelve-color fixture the worst palette callback fell from 27.4 ms to 0.8 ms; all twelve colors reached the mesh, and the intervals from first contentful paint to mesh dismissal were 267 and 249 ms respectively. On the public homepage the first callback took 31–189 ms in four prior cold runs and 1.0 ms in the new build. Neither new trace created a GPU command buffer inside the sampler. This work preceded scrolling; these savings are not subtracted from the scroll measurements.
