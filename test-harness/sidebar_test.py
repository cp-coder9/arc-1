from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

roles = {
    "client": ["Overview", "Post a Job", "Active Projects", "Audit Logs", "Invoices", "Files", "My Settings"],
    "architect": ["Overview", "Marketplace", "My Applications", "Team & Freelancers", "Active Projects", "Audit Logs", "Invoices", "Files", "My Settings"],
    "admin": ["Overview", "Active Projects", "Compliance Hub", "User Management", "LLM Settings", "Knowledge Base", "Audit Logs", "Invoices", "Files", "My Settings"],
    "freelancer": ["Overview", "Active Projects", "Audit Logs", "Invoices", "Files", "My Settings"],
    "bep": ["Overview", "Active Projects", "Audit Logs", "Invoices", "Files", "My Settings"],
}

role = __import__("os").environ.get("TEST_ROLE", "client")
base_url = "http://127.0.0.1:4175"
failures = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda exc: console_errors.append(str(exc)))

    page.goto(base_url, wait_until="networkidle")
    page.wait_for_selector("aside", timeout=20000)

    for label in roles[role]:
        before_errors = len(console_errors)
        try:
            page.get_by_role("button", name=label).click(timeout=5000)
            page.wait_for_timeout(750)
            visible_text = page.locator("main").inner_text(timeout=5000)
            if "Something went wrong" in page.content():
                failures.append(f"{role}: {label} rendered error boundary")
            if not visible_text.strip():
                failures.append(f"{role}: {label} rendered empty main content")
            if len(console_errors) > before_errors:
                new_errors = console_errors[before_errors:]
                failures.append(f"{role}: {label} console errors: {new_errors[:3]}")
        except PlaywrightTimeoutError as exc:
            failures.append(f"{role}: {label} timeout: {exc}")
        except Exception as exc:
            failures.append(f"{role}: {label} failed: {exc}")

    page.screenshot(path=f"test-harness/sidebar-{role}.png", full_page=True)
    browser.close()

if failures:
    print("FAIL")
    for failure in failures:
        print(failure)
    raise SystemExit(1)

print(f"PASS {role}: tested {len(roles[role])} sidebar items")
