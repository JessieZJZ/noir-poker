import UIKit
import Capacitor
import WebKit

class NoirBridgeViewController: CAPBridgeViewController, UIGestureRecognizerDelegate {
    private var edgeBackPending = false

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let webView = webView else { return }
        // Records are same-document pages. Let their managed navigation own
        // each Back, rather than WKWebView's automatic history-item skipping.
        webView.allowsBackForwardNavigationGestures = false
        let edgeBack = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handleEdgeBack(_:)))
        edgeBack.edges = .left
        edgeBack.maximumNumberOfTouches = 1
        edgeBack.delegate = self
        view.addGestureRecognizer(edgeBack)
        webView.scrollView.panGestureRecognizer.require(toFail: edgeBack)
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard !edgeBackPending, let pan = gestureRecognizer as? UIScreenEdgePanGestureRecognizer else { return false }
        let velocity = pan.velocity(in: view)
        return velocity.x > 0 && velocity.x > abs(velocity.y)
    }

    @objc private func handleEdgeBack(_ gesture: UIScreenEdgePanGestureRecognizer) {
        guard gesture.state == .ended, !edgeBackPending, let webView = webView else { return }
        let distance = gesture.translation(in: view).x
        let velocity = gesture.velocity(in: view).x
        guard distance >= view.bounds.width * 0.22 || (distance >= 24 && velocity >= 600) else { return }
        edgeBackPending = true
        webView.evaluateJavaScript("""
            (() => {
              if (!['hand', 'list'].includes(document.body?.dataset.recordsPage)) return false;
              if (!document.querySelector('#orientation-dialog[open]'))
                window.dispatchEvent(new Event('noir:records-back'));
              return true;
            })()
            """) { [weak self, weak webView] result, _ in
            self?.edgeBackPending = false
            if (result as? Bool) != true, let webView = webView, webView.canGoBack {
                webView.goBack()
            }
        }
    }
}

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
