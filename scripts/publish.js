const fs = require('fs')
const path = require('path')
const cp = require('child_process')

const IS_JSR = process.env.JSR === '1'
const MAIN_REGISTRY = IS_JSR ? 'http://jsr.test/' : 'https://registry.npmjs.org'
const REGISTRY = process.env.REGISTRY || MAIN_REGISTRY
exports.REGISTRY = REGISTRY

if (IS_JSR) {
    // for the underlying tools that expect JSR_URL env var
    process.env.JSR_URL = REGISTRY
}

const JSR_EXCEPTIONS = {
    bun: 'never',
    'create-bot': 'never',
    'crypto-node': 'never',
    node: 'never',
    'http-proxy': 'never',
    'socks-proxy': 'never',
    mtproxy: 'never',
    test: 'never',
}

async function checkVersion(name, version, retry = 0) {
    let registry = REGISTRY
    if (!registry.endsWith('/')) registry += '/'

    const url = IS_JSR ? `${registry}@mtcute/${name}/${version}_meta.json` : `${registry}@mtcute/${name}/${version}`

    return fetch(url)
        .then((r) => r.status === 200)
        .catch((err) => {
            if (retry >= 5) throw err

            // for whatever reason this request sometimes fails with ECONNRESET
            // no idea why, probably some issue in docker networking
            console.log('[i] Error checking version:')
            console.log(err)

            return new Promise((resolve) => setTimeout(resolve, 1000)).then(() =>
                checkVersion(name, version, retry + 1),
            )
        })
}

async function publishSinglePackage(name) {
    let packageDir = path.join(__dirname, '../packages', name)

    console.log('[i] Building %s', name)

    // run build script
    cp.execSync('pnpm run build', {
        cwd: packageDir,
        stdio: 'inherit',
    })

    console.log('[i] Publishing %s', name)

    const version = IS_JSR ?
        require(path.join(packageDir, 'dist/jsr/deno.json')).version :
        require(path.join(packageDir, 'dist/package.json')).version

    const exists = await checkVersion(name, version)

    if (exists) {
        if (process.env.E2E && !IS_JSR) {
            console.log('[i] %s already exists, unpublishing..', name)
            cp.execSync(`npm unpublish --registry ${REGISTRY} --force @mtcute/${name}`, {
                cwd: path.join(packageDir, 'dist'),
                stdio: 'inherit',
            })
        } else {
            console.log('[i] %s already exists, skipping..', name)

            return
        }
    }

    if (IS_JSR) {
        // publish to jsr
        cp.execSync('deno publish --allow-dirty', {
            cwd: path.join(packageDir, 'dist/jsr'),
            stdio: 'inherit',
        })
    } else {
        // make sure dist/jsr doesn't exist (it shouldn't, but just in case)
        if (fs.existsSync(path.join(packageDir, 'dist/jsr'))) {
            fs.rmdirSync(path.join(packageDir, 'dist/jsr'), { recursive: true })
        }

        // publish to npm
        const params = REGISTRY === MAIN_REGISTRY ? '--access public' : '--force'
        cp.execSync(`npm publish --registry ${REGISTRY} ${params} -q`, {
            cwd: path.join(packageDir, 'dist'),
            stdio: 'inherit',
        })
    }
}

function listPackages() {
    let packages = []

    for (const f of fs.readdirSync(path.join(__dirname, '../packages'))) {
        if (f[0] === '.') continue
        if (IS_JSR && JSR_EXCEPTIONS[f] === 'never') continue
        if (!IS_JSR && JSR_EXCEPTIONS[f] === 'only') continue

        packages.push(f)
    }

    if (IS_JSR) {
        // we should sort them in a way that dependencies are published first. stc has a util for that
        const map = {}

        for (const pkg of packages) {
            const deps = require(`../packages/${pkg}/package.json`).dependencies || {}
            map[pkg] = Object.keys(deps)
                .filter((d) => d.startsWith('@mtcute/'))
                .map((d) => d.slice(8))
        }

        const stc = require('@teidesu/slow-types-compiler')
        packages = stc.determinePublishOrder(map)
        console.log('[i] Publishing order:', packages.join(', '))
    }

    return packages
}

exports.listPackages = listPackages

async function main(arg = process.argv[2]) {
    if (!arg) {
        console.log('Usage: publish.js <package name | all | updated>')
        process.exit(0)
    }

    console.log('[i] Using registry %s', REGISTRY)

    const publishedPkgs = []
    const failedPkgs = []

    if (arg === 'all' || arg === 'updated') {
        for (const pkg of listPackages()) {
            const pkgVersion = require(`../packages/${pkg}/package.json`).version
            const published = await checkVersion(pkg, pkgVersion)

            if (published) {
                console.log('[i] %s is up to date', pkg)
                continue
            }

            try {
                await publishSinglePackage(pkg)
                publishedPkgs.push(pkg)
            } catch (e) {
                console.error('[!] Failed to publish %s:', pkg)
                console.error(e)
                failedPkgs.push(pkg)
            }
        }
    } else {
        for (const pkg of arg.split(',')) {
            try {
                await publishSinglePackage(pkg)
                publishedPkgs.push(pkg)
            } catch (e) {
                console.error('[!] Failed to publish %s:', pkg)
                console.error(e)
                failedPkgs.push(pkg)
            }
        }
    }

    if (failedPkgs.length > 0) {
        console.error('[!] Failed to publish packages:')

        for (const pkg of failedPkgs) {
            console.error('  - %s', pkg)
        }
        process.exit(1)
    }

    if (process.env.GH_RELEASE) {
        // we should also generate tgz files for all published packages
        // for a github release, and also generate a title
        const tarballs = []

        for (const pkg of publishedPkgs) {
            const dir = path.join(__dirname, '../packages', pkg, 'dist')
            const tar = cp.execSync('npm pack -q', { cwd: dir })
            tarballs.push(path.join(dir, tar.toString().trim()))
        }

        fs.writeFileSync(process.env.GITHUB_OUTPUT, `tarballs=${tarballs.join(',')}\n`, { flag: 'a' })
    }

    process.exit(0) // idk why but it sometimes hangs indefinitely
}

exports.main = main

if (require.main === module) {
    main().catch((e) => {
        console.error(e)
        process.exit(1)
    })
}
