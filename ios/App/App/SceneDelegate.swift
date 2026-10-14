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
        let edgeBack = UIPanGestureRecognizer(target: self, action: #selector(handleEdgeBack(_:)))
        edgeBack.maximumNumberOfTouches = 1
        edgeBack.delegate = self
        view.addGestureRecognizer(edgeBack)
        webView.scrollView.panGestureRecognizer.require(toFail: edgeBack)
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
