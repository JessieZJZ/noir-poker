import UIKit
import Capacitor
import WebKit

class NoirBridgeViewController: CAPBridgeViewController, UIGestureRecognizerDelegate {
    private var edgeBackPending = false
    private let launchHandler = NoirLaunchReadyHandler()
    private var launchCover: UIView?
    #if DEBUG
    private var startupNavigationObservers: [NSKeyValueObservation] = []
    #endif

    override func viewDidLoad() {
        #if DEBUG
        NSLog("[NOIR startup] viewDidLoad before bridge=%@", String(bridge != nil))
        #endif
        super.viewDidLoad()
        #if DEBUG
        NSLog("[NOIR startup] viewDidLoad after url=%@", webView?.url?.absoluteString ?? "nil")
        #endif
    }

    private func installLaunchReadiness(in webView: WKWebView) {
        // Capacitor replaces the configuration's initial content controller.
        // Register after its bridge has installed the final WebView controller.
        let controller = webView.configuration.userContentController
        launchHandler.owner = self
        controller.add(launchHandler, name: "noirLaunchReady")
        controller.addUserScript(WKUserScript(source: """
            (() => {
              const observer = new MutationObserver(ready);
              function ready() {
                if (document.documentElement?.dataset.appReady !== 'true') return;
                observer.disconnect();
                window.webkit.messageHandlers.noirLaunchReady.postMessage('ready');
              }
              observer.observe(document, {
                childList: true, subtree: true, attributes: true,
                attributeFilter: ['data-app-ready']
              });
              ready();
            })();
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        #if DEBUG
        controller.add(NoirStartupDiagnosticHandler(), name: "noirStartupDiagnostic")
        controller.addUserScript(WKUserScript(source: """
            (() => {
              let previous = '';
              const report = (error) => {
                const state = {
                  stage: document.documentElement?.dataset.startupStage || 'document',
                  ready: document.documentElement?.dataset.appReady === 'true',
                  error: error || window.__noirStartup?.error || null
                };
                const serialized = JSON.stringify(state);
                if (serialized !== previous) {
                  previous = serialized;
                  window.webkit.messageHandlers.noirStartupDiagnostic.postMessage(state);
                }
                if (state.ready || state.stage === 'failed') observer.disconnect();
              };
              const observer = new MutationObserver(() => report());
              observer.observe(document, {
                childList: true, subtree: true, attributes: true,
                attributeFilter: ['data-startup-stage', 'data-app-ready']
              });
              window.addEventListener('error', (event) => report({ message: event.message, source: event.filename, line: event.lineno }));
              window.addEventListener('unhandledrejection', (event) => report({ message: String(event.reason?.message || event.reason), stack: String(event.reason?.stack || '') }));
              report();
            })();
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        #endif
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let webView = webView else { return }
        // WKWebView can leave a blank frame after the system launch screen.
        // Keep the same local artwork until the complete first hand is ready.
        let cover = UIView()
        cover.backgroundColor = UIColor(red: 11 / 255, green: 16 / 255, blue: 23 / 255, alpha: 1)
        cover.accessibilityIdentifier = "noir-launch-cover"
        cover.translatesAutoresizingMaskIntoConstraints = false
        webView.addSubview(cover)
        let artworkPath = Bundle.main.url(forResource: "launch-icon", withExtension: "png", subdirectory: "public")
        let artwork = UIImageView(image: artworkPath.flatMap { UIImage(contentsOfFile: $0.path) })
        artwork.contentMode = .scaleAspectFit
        artwork.translatesAutoresizingMaskIntoConstraints = false
        cover.addSubview(artwork)
        NSLayoutConstraint.activate([
            cover.leadingAnchor.constraint(equalTo: webView.leadingAnchor),
            cover.trailingAnchor.constraint(equalTo: webView.trailingAnchor),
            cover.topAnchor.constraint(equalTo: webView.topAnchor),
            cover.bottomAnchor.constraint(equalTo: webView.bottomAnchor),
            artwork.centerXAnchor.constraint(equalTo: cover.centerXAnchor),
            artwork.centerYAnchor.constraint(equalTo: cover.centerYAnchor),
            artwork.widthAnchor.constraint(equalToConstant: 180),
            artwork.heightAnchor.constraint(equalToConstant: 180)
        ])
        launchCover = cover
        installLaunchReadiness(in: webView)
        #if DEBUG
        NSLog("[NOIR startup] launch cover installed url=%@", webView.url?.absoluteString ?? "nil")
        startupNavigationObservers = [
            webView.observe(\.url, options: [.initial, .new]) { webView, _ in
                NSLog("[NOIR startup] navigation url=%@ loading=%@ progress=%f",
                      webView.url?.absoluteString ?? "nil", String(webView.isLoading), webView.estimatedProgress)
            },
            webView.observe(\.estimatedProgress, options: [.new]) { webView, _ in
                NSLog("[NOIR startup] navigation progress=%f url=%@",
                      webView.estimatedProgress, webView.url?.absoluteString ?? "nil")
            }
        ]
        #endif
        // Records are same-document pages. Let their managed navigation own
        // each Back, rather than WKWebView's automatic history-item skipping.
        webView.allowsBackForwardNavigationGestures = false
        let edgeBack = UIPanGestureRecognizer(target: self, action: #selector(handleEdgeBack(_:)))
        edgeBack.maximumNumberOfTouches = 1
        edgeBack.delegate = self
        view.addGestureRecognizer(edgeBack)
        webView.scrollView.panGestureRecognizer.require(toFail: edgeBack)
    }

    fileprivate func finishLaunch(_ message: WKScriptMessage) {
        #if DEBUG
        NSLog("[NOIR startup] ready message mainFrame=%@ sameWebView=%@ url=%@",
              String(message.frameInfo.isMainFrame), String(message.webView === webView),
              webView?.url?.absoluteString ?? "nil")
        #endif
        guard message.frameInfo.isMainFrame,
              message.webView === webView,
              webView?.url?.scheme == "capacitor",
              webView?.url?.host == "localhost",
              message.body as? String == "ready",
              launchCover != nil else { return }
        launchCover?.removeFromSuperview()
        launchCover = nil
        #if DEBUG
        NSLog("[NOIR startup] launch cover removed")
        startupNavigationObservers.removeAll()
        #endif
        // User scripts also run after returning from the local privacy page.
        // Keep their weak-owner handler valid for this controller's lifetime.
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard !edgeBackPending, let pan = gestureRecognizer as? UIPanGestureRecognizer else { return false }
        let velocity = pan.velocity(in: view)
        return velocity.x > 0 && velocity.x > abs(velocity.y)
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        return !edgeBackPending && touch.location(in: view).x <= 24
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        guard let webView = webView, let otherView = otherGestureRecognizer.view else { return false }
        return otherView === webView || otherView.isDescendant(of: webView)
    }

    @objc private func handleEdgeBack(_ gesture: UIPanGestureRecognizer) {
        guard gesture.state == .ended, !edgeBackPending, let webView = webView else { return }
        let distance = gesture.translation(in: view).x
        let verticalDistance = abs(gesture.translation(in: view).y)
        let velocity = gesture.velocity(in: view).x
        guard distance > verticalDistance,
              distance >= view.bounds.width * 0.22 || (distance >= 24 && velocity >= 600) else { return }
        edgeBackPending = true
        webView.evaluateJavaScript("""
            (() => {
              if (document.querySelector('#orientation-dialog[open]')) return true;
              if (!['hand', 'list'].includes(document.body?.dataset.recordsPage)) return false;
              window.dispatchEvent(new Event('noir:records-back'));
              return true;
            })()
            """) { [weak self, weak webView] result, error in
            self?.edgeBackPending = false
            guard error == nil else { return }
            if (result as? Bool) != true, let webView = webView, webView.canGoBack {
                // Step back exactly one page, as Android's Back and the page's
                // own history do. WKWebView's goBack may skip a page WebKit
                // considers uninteracted, such as the local privacy page.
                webView.evaluateJavaScript("history.back()")
            }
        }
    }
}

private final class NoirLaunchReadyHandler: NSObject, WKScriptMessageHandler {
    weak var owner: NoirBridgeViewController?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        owner?.finishLaunch(message)
    }
}

#if DEBUG
private final class NoirStartupDiagnosticHandler: NSObject, WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              message.webView?.url?.scheme == "capacitor",
              message.webView?.url?.host == "localhost",
              let data = try? JSONSerialization.data(withJSONObject: message.body, options: [.sortedKeys]),
              let text = String(data: data, encoding: .utf8) else { return }
        NSLog("[NOIR startup] %@", text)
    }
}
#endif

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = NoirBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
