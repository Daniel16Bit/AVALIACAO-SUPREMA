"""Browser smoke test. Requires Python Playwright and Chromium on the test host.

Uses synthetic accounts and a disposable database; never opens data/.
Install once: pip install -r tests/browser/requirements.txt
              python -m playwright install chromium
Run from the project root: python tests/browser/smoke.py
"""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
REPORTS = ROOT / "tests/reports"
REPORTS.mkdir(exist_ok=True)


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for(url):
    for _ in range(100):
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except (OSError, urllib.error.URLError):
            time.sleep(0.1)
    raise RuntimeError("Service unavailable: " + url)


def request(base, url, data=None, cookie=None, method=None):
    headers = {"Content-Type": "application/json"}
    if cookie:
        headers["Cookie"] = cookie
    req = urllib.request.Request(base + url, data=json.dumps(data).encode() if data is not None else None, headers=headers, method=method)
    with urllib.request.urlopen(req) as response:
        return json.load(response), response.headers.get("Set-Cookie", "").split(";")[0]


def run():
    with tempfile.TemporaryDirectory(prefix="suprema-browser-") as temp:
        api_port, web_port = free_port(), free_port()
        api_url, web_url = f"http://127.0.0.1:{api_port}", f"http://127.0.0.1:{web_port}"
        env = {**os.environ, "API_PORT": str(api_port), "PORT": str(web_port), "API_URL": api_url, "SUPREMA_DATA_DIR": temp}
        # Synthetic local setup via the same admin configurator as the CLI.
        subprocess.run(["node", "-e", "const s=require('./apps/api/src/core/database').openDatabase();try{require('./scripts/admin').configureAdmin(s.db,{name:'Admin Browser',email:'admin@browser.invalid',password:'Browser-Admin-123!'});}finally{s.db.close();}"], cwd=ROOT, env=env, check=True, capture_output=True)
        with open(Path(temp) / "process.log", "w") as log:
            api = subprocess.Popen(["node", "apps/api/server.js"], cwd=ROOT, env=env, stdout=log, stderr=log)
            web = subprocess.Popen(["node", "apps/web/server.js"], cwd=ROOT, env=env, stdout=log, stderr=log)
            try:
                wait_for(api_url + "/api/ready")
                wait_for(web_url + "/health")
                _, cookie = request(web_url, "/api/login", {"login": "admin@browser.invalid", "password": "Browser-Admin-123!"})

                def create(route, data):
                    return request(web_url, "/api/admin/" + route, data, cookie)[0]

                teacher = create("users", {"name": "Professor Browser", "email": "prof@browser.invalid", "matricula": "PROF-BROWSER", "password": "Browser-Prof-123!", "role": "PROFESSOR"})
                student = create("users", {"name": "Aluno Browser", "email": "aluno@browser.invalid", "matricula": "ALUNO-BROWSER", "password": "Browser-Aluno-123!", "role": "ALUNO", "period": "3"})
                course = create("courses", {"name": "Curso Browser"})
                discipline = create("disciplines", {"course_id": course["id"], "name": "Disciplina Browser", "period": "3"})
                create("assignments", {"discipline_id": discipline["id"], "professor_id": teacher["id"], "year": 2026, "semester": "2", "class_name": ""})
                create("enrollments", {"discipline_id": discipline["id"], "student_id": student["student_id"], "year": 2026, "semester": "2", "class_name": ""})

                # A password set by the administrator is provisional: the account must
                # replace it on first access before any screen is shown.
                def first_access(login_name, provisional, own):
                    _, session = request(web_url, "/api/login", {"login": login_name, "password": provisional})
                    request(web_url, "/api/me/password", {"current_password": provisional, "new_password": own}, session)
                    return session

                first_access("prof@browser.invalid", "Browser-Prof-123!", "Browser-Prof-Propria-9!")
                first_access("aluno@browser.invalid", "Browser-Aluno-123!", "Browser-Aluno-Propria-9!")

                # OSCE: the assessment unit builds and releases one event through the API, so the
                # browser part can follow both profiles on real data.
                create("users", {"name": "Nucleo Browser", "email": "nucleo@browser.invalid", "matricula": "NUCLEO-BROWSER", "password": "Browser-Nucleo-123!", "role": "NUCLEO_AVALIACAO"})
                create("users", {"name": "Ambulatorio Browser", "email": "amb@browser.invalid", "matricula": "AMB-BROWSER", "password": "Browser-Amb-123!", "role": "OPERACIONAL"})
                nucleo = first_access("nucleo@browser.invalid", "Browser-Nucleo-123!", "Browser-Nucleo-Propria-9!")
                first_access("amb@browser.invalid", "Browser-Amb-123!", "Browser-Amb-Propria-9!")
                event_id = request(web_url, "/api/osce/events", {"year": 2026, "semester": "2", "round": 1, "period": "3"}, nucleo)[0]["id"]
                detail = request(web_url, f"/api/osce/events/{event_id}", cookie=nucleo)[0]
                saved = request(web_url, f"/api/osce/events/{event_id}", {**detail["event"], "stations": [{"name": "Estacao Browser", "questions": [{"text": "Pergunta ficticia do navegador?"}]}], "student_ids": detail["student_ids"]}, nucleo, method="PUT")[0]
                request(web_url, f"/api/osce/events/{event_id}/release", {"revision": saved["revision"]}, nucleo)

                # Teacher evaluation: the CSTI builds and releases one campaign through the API.
                create("users", {"name": "CSTI Browser", "email": "csti@browser.invalid", "matricula": "CSTI-BROWSER", "password": "Browser-Csti-123!", "role": "CSTI"})
                create("users", {"name": "Coordenacao Browser", "email": "coord@browser.invalid", "matricula": "COORD-BROWSER", "password": "Browser-Coord-123!", "role": "COORDENACAO"})
                csti = first_access("csti@browser.invalid", "Browser-Csti-123!", "Browser-Csti-Propria-9!")
                first_access("coord@browser.invalid", "Browser-Coord-123!", "Browser-Coord-Propria-9!")
                campaign_id = request(web_url, "/api/teacher-eval/campaigns", {"year": 2026, "semester": "2", "round_name": "Rodada Browser", "period": "3"}, csti)[0]["id"]
                draft = request(web_url, f"/api/teacher-eval/campaigns/{campaign_id}", cookie=csti)[0]
                kept = request(web_url, f"/api/teacher-eval/campaigns/{campaign_id}", {**draft["campaign"], "questions": [{"text": "Pergunta docente ficticia?"}], "assignment_ids": draft["assignment_ids"]}, csti, method="PUT")[0]
                request(web_url, f"/api/teacher-eval/campaigns/{campaign_id}/release", {"revision": kept["revision"]}, csti)
                checks, errors, server_errors = [], [], []
                with sync_playwright() as pw:
                    # Prefer the browser Playwright installed for this version; fall back to a system Chromium.
                    try:
                        browser = pw.chromium.launch(headless=True, args=["--no-sandbox"])
                    except Exception:
                        chromium = shutil.which("chromium") or shutil.which("chromium-browser")
                        if not chromium:
                            raise
                        browser = pw.chromium.launch(executable_path=chromium, headless=True, args=["--no-sandbox"])
                    context = browser.new_context(viewport={"width": 1440, "height": 1000})
                    page = context.new_page()
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.on("dialog", lambda dialog: dialog.accept())  # confirmations of the tested flows
                    page.on("response", lambda response: server_errors.append(response.url) if response.status >= 500 else None)

                    def login(user, password, screen):
                        context.clear_cookies()
                        page.goto(web_url)
                        page.locator("#loginInput").fill(user)
                        page.locator("#passwordInput").fill(password)
                        page.locator("#loginForm button[type=submit]").click()
                        page.locator(screen).wait_for(state="visible")

                    page.goto(web_url)
                    page.locator("#loginForm").wait_for(state="visible")
                    checks.append("Login e recursos estaticos carregam")
                    login("admin@browser.invalid", "Browser-Admin-123!", "#adminScreen")
                    page.get_by_role("heading", name="Visão geral", exact=True).wait_for()
                    page.locator("#adminContent .admin-stat").first.wait_for()
                    page.locator('[data-admin-view="users"]').click()
                    page.get_by_text("Professor Browser", exact=True).wait_for()
                    page.screenshot(path=str(REPORTS / "browser-admin.png"), full_page=True)
                    checks.append("Administrador consulta usuarios atraves do proxy")
                    login("prof@browser.invalid", "Browser-Prof-Propria-9!", "#appScreen")
                    page.locator("#scoresTable tbody tr").first.wait_for()
                    assert page.locator("#scoresTable").inner_text().find("Aluno Browser") >= 0
                    page.screenshot(path=str(REPORTS / "browser-professor.png"), full_page=True)
                    checks.append("Professor carrega vinculos e planilha")
                    login("aluno@browser.invalid", "Browser-Aluno-Propria-9!", "#studentScreen")
                    page.locator("#studentResultBody").wait_for(state="visible")
                    checks.append("Aluno acessa painel sem resultados ficticios")
                    page.set_viewport_size({"width": 390, "height": 844})
                    page.screenshot(path=str(REPORTS / "browser-aluno-mobile.png"), full_page=True)
                    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                    checks.append("Painel do aluno cabe em tela de 390px")
                    page.set_viewport_size({"width": 1440, "height": 1000})
                    login("nucleo@browser.invalid", "Browser-Nucleo-Propria-9!", "#profileScreen")
                    page.get_by_role("heading", name="Avaliações OSCE", exact=True).wait_for()
                    page.get_by_role("button", name="Resultados", exact=True).click()
                    page.get_by_role("heading", name="Como as notas são calculadas", exact=True).wait_for()
                    page.get_by_role("heading", name="Notas do OSCE · de 0 a 1", exact=True).wait_for()
                    assert page.get_by_role("link", name="Baixar notas (Excel)").get_attribute("href").endswith("/results/export")
                    checks.append("Nucleo de Avaliacao abre o OSCE liberado e ve o quadro de notas ainda sem avaliacoes")
                    login("amb@browser.invalid", "Browser-Amb-Propria-9!", "#profileScreen")
                    page.get_by_role("button", name="Estacao Browser").click()
                    page.locator("#osceForm select").select_option(index=1)
                    for group in page.locator("#osceForm fieldset").all():
                        group.get_by_label("Fez", exact=True).check()
                    page.get_by_role("button", name="Enviar resposta", exact=True).click()
                    page.get_by_role("button", name="Enviar outra resposta", exact=True).wait_for()
                    page.screenshot(path=str(REPORTS / "browser-osce-ambulatorio.png"), full_page=True)
                    checks.append("Conta operacional responde uma estacao do OSCE e pode enviar outra resposta")
                    # One item done and the posture done: 1 hit of 1, grade 1,00, for the student, the station and the event.
                    login("nucleo@browser.invalid", "Browser-Nucleo-Propria-9!", "#profileScreen")
                    page.get_by_role("button", name="Resultados", exact=True).click()
                    page.get_by_role("heading", name="Notas do OSCE · de 0 a 1", exact=True).wait_for()
                    osce_grades = page.locator("#profileContent").inner_text()
                    assert "1 de 1 alunos avaliados · 1 item · média 1,00" in osce_grades, osce_grades
                    assert page.locator("#profileContent tr.osce-average").inner_text().split() == ["Média", "1,00", "1,00"]
                    page.get_by_role("button", name="Ordenar pela nota final", exact=True).click()
                    page.get_by_role("button", name="Ordenar por nome", exact=True).wait_for()
                    page.screenshot(path=str(REPORTS / "browser-osce-nucleo.png"), full_page=True)
                    checks.append("Nucleo de Avaliacao ve a nota do OSCE calculada pela planilha da instituicao e ordena pela nota final")
                    login("aluno@browser.invalid", "Browser-Aluno-Propria-9!", "#studentScreen")
                    page.locator("#docStudentOpen").click()
                    page.get_by_role("button", name="Responder", exact=True).click()
                    page.locator("#docForm").wait_for()  # the questions arrive from the API
                    for group in page.locator("#docForm fieldset").all():
                        group.get_by_label("Não se aplica", exact=True).check()
                    page.get_by_role("button", name="Enviar avaliação", exact=True).click()
                    page.get_by_text("Comprovante gerado").wait_for()
                    receipt_code = page.locator(".receipt-code").inner_text().strip()
                    page.get_by_role("button", name="Voltar à lista de avaliações").click()
                    page.get_by_text("Respondida", exact=True).wait_for()
                    page.screenshot(path=str(REPORTS / "browser-docente-aluno.png"), full_page=True)
                    checks.append("Aluno responde a avaliacao docente anonima e ela fica marcada como respondida")
                    page.get_by_role("button", name="Meus comprovantes").click()
                    page.get_by_text(receipt_code, exact=True).wait_for()
                    page.screenshot(path=str(REPORTS / "browser-comprovantes-aluno.png"), full_page=True)
                    checks.append("Aluno recebe o comprovante do envio e o encontra em Meus comprovantes")
                    # One answer is below the minimum: after closing, the teacher sees no figure.
                    request(web_url, f"/api/teacher-eval/campaigns/{campaign_id}/close", {}, csti)
                    login("prof@browser.invalid", "Browser-Prof-Propria-9!", "#appScreen")
                    page.locator("#appScreen .sidebar").get_by_role("button", name="Avaliação Docente").click()
                    page.get_by_text("Respostas insuficientes.").wait_for()
                    page.screenshot(path=str(REPORTS / "browser-docente-professor.png"), full_page=True)
                    checks.append("Professor abre a avaliacao docente e nao ve numeros abaixo do minimo de respostas")
                    login("coord@browser.invalid", "Browser-Coord-Propria-9!", "#profileScreen")
                    page.get_by_role("heading", name="Resultado geral por avaliação", exact=True).wait_for()
                    checks.append("Coordenacao abre os resultados da avaliacao docente")
                    login("csti@browser.invalid", "Browser-Csti-Propria-9!", "#profileScreen")
                    page.locator("#profileNav").get_by_role("button", name="Comprovantes").click()
                    page.locator("#receiptVerify input").fill(receipt_code.lower().replace("-", " "))
                    page.get_by_role("button", name="Verificar", exact=True).click()
                    page.get_by_text("Comprovante autêntico.").wait_for()
                    page.screenshot(path=str(REPORTS / "browser-comprovantes-csti.png"), full_page=True)
                    page.locator("#receiptVerify input").fill("AS-0000-0000-0000-0000")
                    page.get_by_role("button", name="Verificar", exact=True).click()
                    page.get_by_text("Código não encontrado.").wait_for()
                    checks.append("CSTI confirma um codigo autentico e recusa um codigo inexistente")
                    login("admin@browser.invalid", "Browser-Admin-123!", "#adminScreen")
                    page.locator("#adminNav").get_by_role("button", name="Comprovantes").click()
                    page.locator("#adminModuleView").get_by_text(receipt_code, exact=True).wait_for()
                    page.locator('[data-admin-view="users"]').click()
                    page.get_by_text("Professor Browser", exact=True).wait_for()
                    assert not page.locator("#adminModuleView").is_visible()
                    checks.append("Administrador lista comprovantes e volta as telas de administracao")
                    # Interdisciplinary articulation, entirely through the screens: the CSTI builds and
                    # releases, the student answers, the CSTI finishes and releases the results.
                    art_title = "Avaliação Caso 7 - Articulação Interdisciplinar"
                    login("csti@browser.invalid", "Browser-Csti-Propria-9!", "#profileScreen")
                    page.locator("#profileNav").get_by_role("button", name="Articulação Interdisciplinar").click()
                    page.get_by_role("button", name="Nova avaliação", exact=True).click()
                    page.locator(".suprema-dialog input[name=title]").fill(art_title)
                    page.get_by_role("button", name="Criar rascunho", exact=True).click()
                    page.get_by_role("heading", name=art_title, exact=True).wait_for()
                    assert page.locator(".art-question").count() == 17
                    tutors, stations = page.locator(".art-list").nth(1), page.locator(".art-list").nth(2)
                    tutors.get_by_role("button", name="Adicionar", exact=True).click()
                    page.locator('[data-list="TUTOR"][data-field="label"]').fill("Tutor Browser")
                    page.locator('[data-list="TUTOR"][data-field="professor_id"]').select_option(label="Professor Browser")
                    stations.get_by_role("button", name="Colar vários de uma vez").click()
                    page.locator(".suprema-dialog textarea").fill("Estacao Browser 1\nEstacao Browser 2\n\nEstacao Browser 3")
                    page.get_by_role("button", name="Acrescentar à lista", exact=True).click()
                    assert page.locator('[data-list="ESTACAO"][data-field="label"]').count() == 3
                    assert page.locator('[data-list="TUTOR"][data-field="label"]').input_value() == "Tutor Browser"
                    page.screenshot(path=str(REPORTS / "browser-articulacao-montagem.png"), full_page=True)
                    page.get_by_role("button", name="Liberar para os alunos", exact=True).click()
                    page.get_by_role("button", name="Finalizar coleta", exact=True).wait_for()
                    checks.append("CSTI monta a Articulacao com nome livre, tutor e estacoes e libera para os alunos")
                    login("aluno@browser.invalid", "Browser-Aluno-Propria-9!", "#studentScreen")
                    page.locator("#artStudentOpen").click()
                    page.get_by_role("button", name="Responder", exact=True).click()
                    page.locator("#artForm").wait_for()
                    for select in page.locator("#artForm select").all():
                        select.select_option(index=1)
                    for group in page.locator("#artForm fieldset").all():
                        if group.locator("input[type=radio]").count():
                            group.locator("input[type=radio]").last.check()
                    page.locator("#artForm textarea").first.fill("Justificativa ficticia do navegador")
                    page.set_viewport_size({"width": 390, "height": 844})
                    page.screenshot(path=str(REPORTS / "browser-articulacao-aluno-mobile.png"), full_page=True)
                    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                    page.set_viewport_size({"width": 1440, "height": 1000})
                    page.get_by_role("button", name="Enviar avaliação", exact=True).click()
                    page.get_by_text("Comprovante gerado").wait_for()
                    art_code = page.locator(".receipt-code").inner_text().strip()
                    assert art_code != receipt_code
                    page.get_by_role("button", name="Voltar à lista de avaliações").click()
                    page.get_by_text("Respondida", exact=True).wait_for()
                    checks.append("Aluno responde a Articulacao em tela de 390px e recebe o comprovante")
                    login("csti@browser.invalid", "Browser-Csti-Propria-9!", "#profileScreen")
                    page.locator("#profileNav").get_by_role("button", name="Articulação Interdisciplinar").click()
                    page.get_by_role("button", name="Abrir", exact=True).click()
                    page.get_by_role("button", name="Finalizar coleta", exact=True).click()
                    page.get_by_role("button", name="Liberar resultados", exact=True).click()
                    page.get_by_role("button", name="Recolher os resultados", exact=True).wait_for()
                    page.get_by_role("heading", name="Como ler estes números", exact=True).wait_for()
                    page.get_by_role("heading", name="Resultado geral · 1 resposta(s)", exact=True).wait_for()
                    art_report = page.locator("#profileContent").inner_text()
                    assert art_report.find("Aluno Browser") >= 0
                    # The student chose the last option of every question: grade 10 and "Parcialmente" or "Não".
                    assert "Média 10,00 · menor nota 10 · maior nota 10" in art_report
                    assert "Parcialmente 1 100%" in art_report and "Sim 0 0%" in art_report
                    assert "A instituição não usa um número único de desempenho por tutor" in art_report
                    page.locator("#profileContent .art-tutor summary").filter(has_text="1 resposta(s)").click()
                    page.locator("#profileContent .art-tutor[open] .art-figures").first.wait_for()
                    assert page.get_by_role("link", name="Baixar respostas e relatório (Excel)").get_attribute("href").endswith("/export")
                    page.screenshot(path=str(REPORTS / "browser-articulacao-csti.png"), full_page=True)
                    checks.append("CSTI finaliza a coleta, libera os resultados e ve as medias e os percentuais do relatorio, sem numero unico de desempenho")
                    login("prof@browser.invalid", "Browser-Prof-Propria-9!", "#appScreen")
                    page.locator("#appScreen .sidebar").get_by_role("button", name="Articulação Interdisciplinar").click()
                    page.locator("#moduleView .art-withheld").wait_for()
                    assert page.locator("#moduleView").inner_text().find("Aluno Browser") < 0
                    page.screenshot(path=str(REPORTS / "browser-articulacao-tutor.png"), full_page=True)
                    checks.append("Tutor abre o proprio quadro da Articulacao, sem nomes e sem numeros abaixo do minimo")
                    login("coord@browser.invalid", "Browser-Coord-Propria-9!", "#profileScreen")
                    page.locator("#profileNav").get_by_role("button", name="Articulação Interdisciplinar").click()
                    page.get_by_role("heading", name="Resultado geral · 1 resposta(s)", exact=True).wait_for()
                    page.get_by_text("Justificativa ficticia do navegador").first.wait_for(state="attached")
                    checks.append("Coordenacao abre os resultados liberados da Articulacao")
                    # A missing optional frontend enhancement does not stop login.
                    page.route("**/features/evolucao/analytics.js", lambda route: route.abort())
                    login("prof@browser.invalid", "Browser-Prof-Propria-9!", "#appScreen")
                    page.locator("#scoresTable tbody tr").first.wait_for()
                    checks.append("Arquivo opcional de evolucao ausente nao impede professor")
                    page.unroute("**/features/evolucao/analytics.js")
                    # The complements of the teacher and student screens register themselves in
                    # window.SupremaHooks; without them the base screens still work.
                    for optional in ("indicadores/analytics.js", "academico/academico.js"):
                        page.route("**/features/" + optional, lambda route: route.abort())
                    login("prof@browser.invalid", "Browser-Prof-Propria-9!", "#appScreen")
                    page.locator("#scoresTable tbody tr").first.wait_for()
                    page.locator('[data-tab="results"]').click()
                    page.locator("#resultsTab").wait_for(state="visible")
                    page.locator('[data-tab="individual"]').click()
                    page.locator("#individualTab").wait_for(state="visible")
                    login("aluno@browser.invalid", "Browser-Aluno-Propria-9!", "#studentScreen")
                    page.locator("#studentResultBody").wait_for(state="visible")
                    assert page.evaluate("Object.keys(window.SupremaHooks.list).length") == 0
                    checks.append("Complementos de tela ausentes nao impedem professor nem aluno")
                    for optional in ("indicadores/analytics.js", "academico/academico.js"):
                        page.unroute("**/features/" + optional)
                    assert not server_errors, server_errors
                    context.clear_cookies()
                    page.goto(web_url)
                    api.terminate()
                    api.wait(timeout=10)
                    page.reload()
                    page.locator("#serviceStatus").wait_for(state="visible")
                    assert "indisponivel" in page.locator("#serviceStatus").inner_text()
                    page.locator("#loginForm").wait_for(state="visible")
                    checks.append("Interface continua aberta e informa queda da API")
                    page.screenshot(path=str(REPORTS / "browser-api-offline.png"), full_page=True)
                    api = subprocess.Popen(["node", "apps/api/server.js"], cwd=ROOT, env=env, stdout=log, stderr=log)
                    wait_for(api_url + "/api/ready")
                    # The status check runs every 15s, no page reload required.
                    page.locator("#serviceStatus").wait_for(state="hidden", timeout=20000)
                    checks.append("Aviso desaparece apos API se recuperar sem recarregar tela")
                    assert not errors, errors
                    checks.append("Nenhum erro JavaScript nos fluxos testados")
                    browser.close()
                (REPORTS / "browser-smoke.json").write_text(json.dumps({"status": "APROVADO", "checks": checks, "javascript_errors": errors}, indent=2, ensure_ascii=False))
                print(f"{len(checks)} verificacoes de navegador aprovadas")
            finally:
                for process in (api, web):
                    if process.poll() is None:
                        process.terminate()
                        try:
                            process.wait(timeout=10)
                        except subprocess.TimeoutExpired:
                            process.kill()
                            process.wait()


if __name__ == "__main__":
    run()
