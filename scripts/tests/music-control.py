"""Exercise scoped mounts, Java HTTP and live key rotation without real credentials/network."""
import os
import secrets
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

root = Path(__file__).resolve().parents[2]
image = os.environ.get("MUSIC_TEST_IMAGE", "chat-friends-music")
java_image = os.environ.get("MUSIC_TEST_JAVA_IMAGE", "maven:3.9.11-eclipse-temurin-25")
name = "friends-music-key-test-" + uuid.uuid4().hex[:12]
network = name + "-net"


def run(*args, expected=0, **kwargs):
    result = subprocess.run(args, capture_output=True, text=True, timeout=45, **kwargs)
    if result.returncode != expected:
        raise AssertionError("Isolated music test failed: " + args[0] + " (output omitted)")
    return result.stdout


with tempfile.TemporaryDirectory() as temp:
    base = Path(temp)
    scoped = base / "music"
    scoped.mkdir(); scoped.chmod(0o755)
    key = scoped / "control.key"
    old = secrets.token_hex(32)
    key.write_text(old); key.chmod(0o644)
    old_file = base / "old.key"
    old_file.write_text(old); old_file.chmod(0o644)
    (base / "db-credential-not-for-worker").write_text("test-only-private-data")
    source = base / "Probe.java"
    source.write_text('''import java.net.*;import java.net.http.*;import java.nio.file.*;import java.time.*;
class Probe {public static void main(String[] a)throws Exception{
 if(Files.exists(Path.of("/run/music/db-credential-not-for-worker")))throw new Exception("Mount too broad");
 var key=Files.readString(Path.of(a[0])).strip();
 try(var client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build()){
 var request=HttpRequest.newBuilder(URI.create("http://music:8090/state")).timeout(Duration.ofSeconds(4)).header("Authorization","Bearer "+key).GET().build();
 var response=client.send(request,HttpResponse.BodyHandlers.ofString());
 if(response.statusCode()!=Integer.parseInt(a[1]))throw new Exception("Unexpected status");
 System.out.println("Java -> music: HTTP "+response.statusCode());}}}''')
    source.chmod(0o644)
    probe = (root / "scripts/diagnose-music.sh").read_text().split("<<'PROBE'\n", 1)[1].rsplit("\nPROBE", 1)[0]
    mounts = ["--mount", f"type=bind,src={scoped},dst=/run/music,readonly", "--mount", f"type=bind,src={old_file},dst=/run/old.key,readonly"]
    try:
        run("docker", "network", "create", "--internal", network)
        run("docker", "run", "-d", "--name", name, "--network", network, "--network-alias", "music", "--memory", "512m", "--pids-limit", "96", "--cap-drop", "ALL", "--read-only", "--tmpfs", "/tmp:size=32m,mode=1777", "-e", "MUSIC_SECRET_FILE=/run/music/control.key", *mounts, image)
        health = 'from pathlib import Path;import urllib.request;r=urllib.request.Request("http://127.0.0.1:8090/state",headers={"Authorization":"Bearer "+Path("/run/music/control.key").read_text().strip()});assert urllib.request.urlopen(r,timeout=2).status==200'
        deadline = time.monotonic() + 20
        while True:
            result = subprocess.run(["docker", "exec", name, "python", "-c", health], capture_output=True, timeout=5)
            if result.returncode == 0:
                break
            if time.monotonic() > deadline:
                raise AssertionError("Music startup failed (output omitted)")
            time.sleep(.25)
        def java(path, status):
            return run("docker", "run", "--rm", "--network", network, *mounts, "--mount", f"type=bind,src={source},dst=/probe/Probe.java,readonly", java_image, "java", "/probe/Probe.java", path, str(status))
        print(java("/run/music/control.key", 200).strip())
        new = secrets.token_hex(32)
        replacement = scoped / "replacement.tmp"
        replacement.write_text(new); replacement.chmod(0o644); os.replace(replacement, key)
        print(java("/run/music/control.key", 200).strip())
        print(java("/run/old.key", 401).strip())
        run("docker", "exec", name, "python", "-c", health)
        for path, expected in [("/run/music/control.key", 0), ("/run/old.key", 1)]:
            report = run("docker", "run", "--rm", "-i", "--network", network, *mounts, "-e", "MUSIC_SECRET_FILE=" + path, java_image, "bash", "-s", expected=expected, input=probe)
            assert old not in report and new not in report
            assert ("HTTP 200" if expected == 0 else "chave divergente") in report
        print("Music: rotation without restart, old key rejected, healthcheck 200, scoped mount and safe diagnostic OK.")
    finally:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True)
        subprocess.run(["docker", "network", "rm", network], capture_output=True)
