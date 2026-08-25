"""
本機 HTTPS 開發伺服器
用途：讓手機透過區網連進電腦上的 PWA，即時預覽 / 除錯，確認 OK 再 push。

使用方式：
    python serve.py            # 預設 port 8443
    python serve.py 9443       # 指定 port

前置條件：
    - 手機與電腦連到同一個 Wi-Fi（例如你手機開的熱點）
    - 瀏覽器需要 HTTPS 才能開相機，所以會用 cert.pem / key.pem
    - 若不存在，會自動用 Python 內建方式產一組自簽憑證（需要有 openssl 或 cryptography 套件）
    - 手機第一次連會出現「不安全」警告 → 點「進階 / 繼續前往」即可

會顯示可以直接在手機瀏覽器輸入的網址。
"""

from __future__ import annotations

import http.server
import ipaddress
import os
import socket
import ssl
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CERT = ROOT / "cert.pem"
KEY = ROOT / "key.pem"


def get_lan_ips() -> list[str]:
    """回傳所有可能的區網 IP（排除 127.x 與 link-local）。"""
    ips: list[str] = []
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None):
            ip = info[4][0]
            if ":" in ip:
                continue  # 忽略 IPv6
            if ip.startswith("127.") or ip.startswith("169.254."):
                continue
            if ip not in ips:
                ips.append(ip)
    except socket.gaierror:
        pass

    # 補上路由探測法（Windows 有時 hostname 拿不到熱點介面）
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and ip not in ips and not ip.startswith("127."):
            ips.insert(0, ip)
    except OSError:
        pass

    return ips


def ensure_cert() -> None:
    if CERT.exists() and KEY.exists():
        return
    print("[serve] 找不到 cert.pem / key.pem，嘗試自動產生自簽憑證……")
    # 先試 cryptography 套件
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
        import datetime

        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = issuer = x509.Name(
            [x509.NameAttribute(NameOID.COMMON_NAME, "id-scanner-dev")]
        )
        san = [x509.DNSName("localhost")]
        for ip in get_lan_ips():
            try:
                san.append(x509.IPAddress(ipaddress.ip_address(ip)))
            except ValueError:
                pass
        san.append(x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")))
        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(datetime.datetime.utcnow() - datetime.timedelta(days=1))
            .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=825))
            .add_extension(x509.SubjectAlternativeName(san), critical=False)
            .sign(key, hashes.SHA256())
        )
        CERT.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        KEY.write_bytes(
            key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )
        print("[serve] 已用 cryptography 產生 cert.pem / key.pem")
        return
    except ImportError:
        pass

    # 退而求其次：openssl CLI
    try:
        subprocess.check_call(
            [
                "openssl",
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-keyout",
                str(KEY),
                "-out",
                str(CERT),
                "-days",
                "825",
                "-subj",
                "/CN=id-scanner-dev",
            ]
        )
        print("[serve] 已用 openssl 產生 cert.pem / key.pem")
    except (FileNotFoundError, subprocess.CalledProcessError) as e:
        sys.exit(
            "[serve] 無法自動產生憑證。請安裝：pip install cryptography  或  安裝 openssl。\n"
            f"詳細：{e}"
        )


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """開發時關掉快取，避免手機端拿到舊檔。"""

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format: str, *args) -> None:  # noqa: A002
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), format % args))


def main() -> None:
    port = 8443
    if len(sys.argv) > 1:
        port = int(sys.argv[1])

    os.chdir(ROOT)
    ensure_cert()

    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(certfile=str(CERT), keyfile=str(KEY))

    httpd = http.server.ThreadingHTTPServer(("0.0.0.0", port), NoCacheHandler)
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)

    ips = get_lan_ips()
    print("=" * 60)
    print(f"HTTPS 伺服器已啟動 (Ctrl+C 停止)")
    print(f"  本機：   https://localhost:{port}/")
    for ip in ips:
        print(f"  手機：   https://{ip}:{port}/")
    print("=" * 60)
    print("提示：")
    print(" - 手機瀏覽器出現「不安全」警告 → 進階 → 繼續前往，是正常的。")
    print(" - 已停用瀏覽器快取；若 PWA 還讀到舊檔，請在手機瀏覽器手動關掉分頁再重開，")
    print("   或在 DevTools 遠端把 Service Worker 註銷。")
    print()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[serve] 收到 Ctrl+C，關閉伺服器。")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
