"""Copy verified store deliverables and build CRC-checked locale ZIP files."""

import hashlib
import json
import shutil
import sys
import zipfile
from pathlib import Path


source = Path(sys.argv[1]).resolve()
destination = Path(sys.argv[2]).resolve()
qa = source.parent / "qa" / "delivery-verification.json"
report = json.loads(qa.read_text())
if report["status"] != "passed" or report["failures"]:
    raise RuntimeError("Complete the delivery verification before packaging")
if source == destination or source in destination.parents or destination in source.parents:
    raise RuntimeError("Use a separate delivery directory")
shutil.copytree(source, destination, dirs_exist_ok=True, ignore=shutil.ignore_patterns(".sheets"))
shutil.copy2(qa, destination / "验收报告.json")
attachments = destination / "验收附件"
attachments.mkdir(exist_ok=True)
for name in ["audio-mix-verification.json", "voice-timing.json", "font-coverage.json", "verified-stories.json"]:
    shutil.copy2(source.parent / "qa" / name, attachments / name)
locales = json.loads((source / "语言与上传索引.json").read_text())


def make_zip(output, entries):
    temporary = output.with_suffix(".zip.partial")
    with zipfile.ZipFile(temporary, "w", allowZip64=True) as archive:
        for file, relative in entries:
            compression = (
                zipfile.ZIP_STORED
                if file.suffix.lower() in {".png", ".mp4", ".m4a", ".zip"}
                else zipfile.ZIP_DEFLATED
            )
            archive.write(file, relative.as_posix(), compress_type=compression)
    with zipfile.ZipFile(temporary) as archive:
        corrupt = archive.testzip()
        if corrupt:
            raise RuntimeError("ZIP CRC failure: " + corrupt)
    temporary.replace(output)


def checksum(file):
    with file.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


packages = destination / "packages"
packages.mkdir(exist_ok=True)
for locale in locales:
    name = locale["locale"]
    folder = destination / name
    make_zip(
        packages / f"NOIR-Poker-{name}.zip",
        [(p, p.relative_to(destination)) for p in sorted(folder.rglob("*")) if p.is_file()],
    )
    print(name + " archive CRC passed", flush=True)

guide = """# NOIR Poker · 11 种语言上架资料

先打开「打开预览.html」查看每种语言的视频、截图概览和可复制文案。
11 个独立语言 ZIP 位于 packages/，解压后每个语言都有完整 apple/、google/、video/。

每语言含：29.8 秒横屏介绍视频、3840×1772 高清母版、本语言旁白与字幕、
Google 手机/7 英寸平板/10 英寸平板/桌面各 8 张、Apple 两档 iPhone 与 iPad 各 8 张、
1024×500 置顶大图、512/1024 图标、两家商店独立字段 TXT 与填写指南。

Apple 与 Google 共用 video/shared-preview.mp4。Apple 上传该 MP4；
Google 视频栏需先上传到自己的 YouTube，再填写视频链接。未代为上传或发布。
Apple 请使用标准版，master-3840.mp4 用于大屏查看和后续编辑。

地区：英文 en-US；简中 zh-Hans / zh-CN；繁中 zh-Hant / zh-TW；
日语 ja / ja-JP；韩语 ko / ko-KR；西语 es-ES；意语 it / it-IT；
葡语 pt-BR；德语 de-DE；法语 fr-FR；俄语 ru / ru-RU。

新增商店文案、宣传标题、字幕、旁白按当地表达改写，并统一扑克术语。
App 内画面来自 PR70 实际安装版本，保留真实界面。原有词库中的少量生硬译文
见各包「原有界面译文待办.md」；本素材交付没有改动 App 翻译代码，
也不表示第三方母语人员已完成全部产品词库的人工审校。

原生图片来自实际安装的 iOS/Android 模拟器 App，桌面图来自生产 Web 页面，
没有把手机图拉伸成平板图。桌面图不是 Google Play Games PC 原生发行验收。

技术检查见「验收报告.json」和各语言 technical-verification.json。
图片尺寸、文件大小、颜色通道、文案长度、22 个视频的完整解码均已检查。
SHA256SUMS.txt 校验除自身与总 ZIP 以外的所有文件；总 ZIP 的校验另附。
这是素材包，不包含签名安装包、发布凭据、隐私问卷或商店审核结果。
"""
(destination / "先读我-11语言填写指南.md").write_text(guide, encoding="utf8")
combined = destination / "NOIR-Poker-11-Language-Store-Kits.zip"
manifest = destination / "SHA256SUMS.txt"
archive_hash = destination / "NOIR-Poker-11-Language-Store-Kits.zip.sha256"
files = [
    p
    for p in sorted(destination.rglob("*"))
    if p.is_file()
    and p not in {combined, manifest, archive_hash}
    and not p.name.endswith(".partial")
]
manifest.write_text(
    "\n".join(
        checksum(p)
        + "  " + p.relative_to(destination).as_posix()
        for p in files
    ) + "\n",
    encoding="utf8",
)
make_zip(combined, [(p, p.relative_to(destination)) for p in files + [manifest]])
archive_hash.write_text(
    checksum(combined)
    + "  " + combined.name + "\n",
    encoding="utf8",
)
print("Combined archive CRC passed: " + str(combined), flush=True)
