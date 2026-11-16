"""Bounded extra assets for the explicitly selected gateway/SDK guest."""

import hashlib
import importlib.util
import json
from pathlib import Path
import re

FAILED = 'AGENT_LINUX_GUEST_PREPARE_FAILED'


def fail():
    raise ValueError(FAILED) from None


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                fail()
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs, parse_float=lambda _: fail(), parse_constant=lambda _: fail())


def load(cache, contract_path, containment_contract, read_owned, read_source):
    contract = strict_json(read_owned(contract_path, 65536))
    if (type(contract) is not dict or set(contract) != {'version', 'containment_assets_sha256', 'assets'}
            or contract['version'] != 'sun-world-linux-gateway-assets/1'
            or contract['containment_assets_sha256'] != sha(read_owned(containment_contract, 65536))
            or type(contract['assets']) is not list or len(contract['assets']) != 1):
        fail()
    entry = contract['assets'][0]
    if (entry['filename'] != 'openssl.deb' or entry['max_bytes'] != 4194304
            or type(entry['sha256']) is not str or not re.fullmatch('[0-9a-f]{64}', entry['sha256'])):
        fail()
    openssl = read_owned(cache / 'openssl.deb', 4194304, private=True)
    if sha(openssl) != entry['sha256']:
        fail()
    manifest = strict_json(read_owned(cache / 'sdk-runtime.tar.gz.manifest.json', 65536, private=True))
    fields = {'version', 'sdk_version', 'architecture', 'libc', 'node', 'selected_source_sha256',
              'linux_binary_sha256', 'entries', 'expanded_bytes', 'archive', 'portable_cli_link', 'install_scripts'}
    if (type(manifest) is not dict or set(manifest) != fields or manifest['version'] != 'sun-world-linux-sdk-archive/1'
            or manifest['sdk_version'] != '0.2.2-rc.1' or manifest['architecture'] != 'arm64'
            or manifest['libc'] != 'glibc' or manifest['node'] != '24.17.0'
            or manifest['portable_cli_link'] is not True or manifest['install_scripts'] is not False
            or type(manifest['entries']) is not int or not 1 <= manifest['entries'] <= 65536
            or type(manifest['expanded_bytes']) is not int or not 1 <= manifest['expanded_bytes'] <= 1024**3):
        fail()
    spec = importlib.util.spec_from_file_location('owned_linux_sdk_recipe', Path(__file__).with_name('prepare-agent-linux-sdk.py'))
    recipe = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(recipe)
    hashes = manifest['selected_source_sha256']
    if type(hashes) is not dict or set(hashes) != set(recipe.SOURCES):
        fail()
    for name in recipe.SOURCES:
        if type(hashes[name]) is not str or sha(read_source(name)) != hashes[name]:
            fail()
    binaries = manifest['linux_binary_sha256']
    if type(binaries) is not dict or not 2 <= len(binaries) <= 32:
        fail()
    for name, digest in binaries.items():
        if (not name.startswith('node_modules/.pnpm/') or len(name) > 4096 or '\\' in name
                or any(part in ('', '.', '..') for part in name.split('/'))
                or type(digest) is not str or not re.fullmatch('[0-9a-f]{64}', digest)):
            fail()
    archive = manifest['archive']
    if (type(archive) is not dict or set(archive) != {'sha256', 'size'}
            or type(archive['size']) is not int or not 1 <= archive['size'] <= 536870912
            or type(archive['sha256']) is not str or not re.fullmatch('[0-9a-f]{64}', archive['sha256'])):
        fail()
    sdk = read_owned(cache / 'sdk-runtime.tar.gz', 536870912, private=True)
    if len(sdk) != archive['size'] or sha(sdk) != archive['sha256']:
        fail()
    return {'openssl.deb': openssl, 'sdk-runtime.tar.gz': sdk}, {
        'openssl.deb': {'sha256': sha(openssl), 'size': len(openssl)},
        'sdk-runtime.tar.gz': {**archive, 'manifest': manifest}}


def openssl_archive(raw, deb_archive):
    import zstandard
    if zstandard.__version__ != '0.25.0':
        fail()
    data = deb_archive(raw)
    parameters = zstandard.get_frame_parameters(data)
    maximum = 8 * 1024**2
    if (not 0 < parameters.window_size <= maximum or parameters.content_size != zstandard.CONTENTSIZE_UNKNOWN
            and not 0 < parameters.content_size <= maximum):
        fail()
    # The 0.25 C backend passes this value directly to the byte-based zstd API.
    decoded = zstandard.ZstdDecompressor(max_window_size=maximum).decompress(data,
        max_output_size=maximum, read_across_frames=False, allow_extra_data=False)
    if len(decoded) > maximum:
        fail()
    # 0.25's unknown-size fast path ignores allow_extra_data. Recheck the
    # already bounded first frame with the single-frame object's EOF/tail state.
    verifier = zstandard.ZstdDecompressor(max_window_size=maximum).decompressobj()
    verified = verifier.decompress(data)
    if not verifier.eof or verifier.unused_data or verified != decoded:
        fail()
    return decoded
