const irc = require('irc')
const { networkInterfaces } = require('os')
const fs = require('fs')
const spawn = require('child_process').spawn
require('dotenv').config()

const interfaces = networkInterfaces()
const eth0 = interfaces.eth0 ? interfaces.eth0.filter((a) => a.family === 'IPv4')[0].address : ''

console.log('***')
console.log('* ddnet irc bot - call !mods on ddnet dvlpr irc')
console.log('*')
console.log(`* eth0=${eth0}`)
console.log(`* irc channel=${process.env.IRC_CHANNEL}`)
console.log(`* mod ping=${process.env.MOD_PING}`)
console.log('***')

const getServerIpsByPlayerName = async (searchName) => {
	const res = await fetch('https://master1.ddnet.org/ddnet/15/servers.json')
	const data = await res.json()
	let matchedEntries = []
	data.servers.forEach((entry) => {
		const names = entry.info.clients.map((client) => client.name)
		if (names.includes(searchName)) {
			matchedEntries.push(entry)
		}
	})
	// console.log(matchedEntries)
	matchedEntries = matchedEntries.filter((e) => e.info.name.startsWith('DDNet '))

	// console.log(matchedEntries)
	const ips = []
	matchedEntries.forEach((entry) => {
		entry.addresses
			.filter((addr) => addr.startsWith('tw-0.7+udp://'))
			.forEach((addr) => ips.push(addr))
	})
	const ddnetLinks = ips.map((ip) => `ddnet://${ip.substr(13)}`)
	return ddnetLinks
}

const sendHelpToChiler = async () => {
	const links = await getServerIpsByPlayerName('ChillerDragon')
	// console.log(links)
	if (links.length === 0) {
		console.log('WARNOING chiler not foudn')
		return 'chiler is in danger on a unknown tw server'
	} else if (links.length === 1) {
		return `send help to chiler by clickin on this link ${links[0]}`
	}
	return `chiler is one one of those servers ${links.join(', ')} send help to this poor soul in danger`
}

const client = new irc.Client(process.env.IRC_SERVER, 'chillerbot', {
	channels: [`#${process.env.IRC_CHANNEL}`],
})

const checkPingPongCmd = (cmd) => {
	let res = false
	try {
		const data = fs.readFileSync('ping_pong.csv', 'utf8');
		const rows = data.split('\n')

		rows.forEach((row) => {
			const [ping, pong] = row.split(', ')
			if (cmd === ping) {
				res = pong
				return
			}
		})
	} catch (err) {
		console.error(err)
	}
	return res;
}

const isPapaChiler = (from, isBridge, client) => {
	if (from !== 'ChillerDragon') {
		client.say(`#${process.env.IRC_CHANNEL}`, 'only papa chiler can pinger.');
		return false
	}
	if (isBridge) {
		client.say(`#${process.env.IRC_CHANNEL}`, 'this command only works from irc');
		return false
	}
	return true
}

const messageQueue = []
/*
 * fakefiles
 * key: rel or abs path
 * val: [filenames]
 */
const fakeFiles = {
	'.': [
		"env.example",
		"hex_to_pack.py",
		"index.js",
		"LICENSE",
		"node_modules",
		"package.json",
		"package-lock.json",
		"ping_pong.csv",
		"README.md",
		"tags",
		"Dockerfile"
	]
}
let FAKE_PWD = '/home/pi'
let FAKE_SHELL = 'bash'

const strPython = (userinput) => {
	const strpy = /\s*["'][a-zA-Z]+["']\s*/
	const printMaffs = new RegExp(`^print\\(${strpy.source}\\)$`)
	if (printMaffs.test(userinput)) {
		return userinput
	}
	const simpleStr = new RegExp(`^${strpy.source}$`)
	if (printMaffs.test(userinput)) {
		return `print(${userinput})`
	}
	const fstrpy = /\s*f["'][a-zA-Z]+["']\s*/
	const fprintMaffs = new RegExp(`^print\\(${fstrpy.source}\\)$`)
	if (printMaffs.test(userinput)) {
		return userinput
	}
	const fstrpyInter = /\s*f["'][a-zA-Z]+{[0-9]*}["']\s*/
	const fprintInterDelim = new RegExp(`^print\\(${fstrpyInter.source}\\)$`)
	if (printMaffs.test(userinput)) {
		return userinput
	}
	return false
}

const maffsPython = (userinput) => {
	let pycode = false
	const maffs = /(\s*[\+\-\*\/]*\s*\d+\s*[\+\-\*\/]*)+/
	const printMaffs = new RegExp(`^print\\(${maffs.source}\\)$`)
	if (printMaffs.test(userinput)) {
		pycode = userinput
	}
	const simpleMaffs = new RegExp(`^${maffs.source}$`)
	if (simpleMaffs.test(userinput)) {
		pycode = `print(${userinput})`
	}
	const maffsInArray = new RegExp(`(\\[(\s*${maffs.source}\s*,?\s*)*\\])`)
	const maffsInArrayDelim = new RegExp(`^${maffsInArray.source}$`)
	if (maffsInArrayDelim.test(userinput)) {
		pycode = `print(${userinput})`
	}
	const maffsWithArray = new RegExp(`^(${maffsInArray.source}*\[\\+\\-\\*\\/\]*${maffsInArray.source}*)*$`)
	if (maffsWithArray.test(userinput)) {
		pycode = `print(${userinput})`
	}
	const loop = /^\[[a-zA-Z0-9]*\s+for\s+[a-zA-Z0-9]+\s+in\s+range\(\d\)\]$/
	if (loop.test(userinput)) {
		pycode = `print(${userinput})`
	}
	return pycode
}

const safeBash = (userinput) => {
	if (userinput === 'uname' || userinput === 'uname;' || userinput === 'uname -r') {
		return userinput
	}
	if (userinput === 'id' || userinput === 'id;') {
		return userinput
	}
	if (["echo $SHELL", "echo $SHELL;", "echo '$SHELL'", 'echo "$SHELL"', "echo '$SHELL';", 'echo "$SHELL";' ].includes(userinput)) {
		return userinput
	}
	if (userinput === 'uptime' || userinput === 'uptime;') {
		return userinput
	}
	if (userinput === 'uptime' || userinput === 'uptime;') {
		return userinput
	}
	if (userinput === 'neofetch' || userinput === 'neofetch;') {
		return userinput
	}
	// if (["ls", "ls .", "ls;", "ls .;"].includes(userinput)) {
	// 	return userinput
	// }
	const safeToReadFiles = [
		'/proc/stat',
		'/etc/os-release',
		'LICENSE',
		'ping_pong.csv',
		'hex_to_pack.py',
		'index.js',
		'package.json',
		'package-lock.json',
		'README.md',
		'tags',
		'env.example'
	]
	let safe = false
	safeToReadFiles.forEach((file) => {
		const catPattern = new RegExp(`^cat\\s+${file}$`)
		if (catPattern.test(userinput)) {
			safe = userinput
			return
		}
		const grep = 'e?grep(\\s+\\-[vFinl])?'
		const grepPattern = new RegExp(`^cat\\s+${file}\\s+\\|\\s+${grep}\\s+[a-zA-Z0-9_]+$`)
		if (grepPattern.test(userinput)) {
			safe = userinput
			return
		}
		const grepPatternGoodStyle = new RegExp(`^${grep}\\s+[a-zA-Z0-9_]+\\s+${file}$`)
		if (grepPatternGoodStyle.test(userinput)) {
			safe = userinput
			return
		}
	})
	return safe
}

const fakeBash = (userinput) => {
	if (userinput === ':(){ :|:& };:' || userinput === ':(){:|:&};:') {
		return 'Killed'
	}
	if (["bash", "bash;", "bash -c bash"].includes(userinput)) {
		FAKE_PWD = '/home/pi'
		FAKE_SHELL = '/bin/bash'
		return ''
	} else if (["zsh", "zsh;", "bash -c zsh"].includes(userinput)) {
		FAKE_PWD = '/home/pi'
		FAKE_SHELL = '/bin/zsh'
		return ''
	} else if (["rm -rf .;", "rm -rf .", "rm *;", "rm *"].includes(userinput)) {
		fakeFiles['.'] = []
		return ''
	} else if (["ls", "ls .", "ls;", "ls .;", "ls *", "ls *;"].includes(userinput)) {
		// let files = [
		// 	"env.example",
		// 	"hex_to_pack.py",
		// 	"index.js",
		// 	"LICENSE",
		// 	"node_modules",
		// 	"package.json",
		// 	"package-lock.json",
		// 	"ping_pong.csv",
		// 	"README.md",
		// 	"tags",
		// 	"Dockerfile"
		// ]
		// if(fakeFiles['.']) {
		// 	files = files.concat(fakeFiles['.']).sort()
		// }
		return fakeFiles['.'].sort().join('\n')

	} else if (["pwd", "pwd;"].includes(userinput)) {
		return FAKE_PWD;
	} else if (["env", "env;"].includes(userinput)) {
		const env = [
				`SHELL=${FAKE_SHELL}`,
				'NVM_INC=/home/pi/.nvm/versions/node/v18.16.0/include/node',
				'LANGUAGE=en_US',
				`PWD=${FAKE_PWD}`,
				'LOGNAME=pi',
				'XDG_SESSION_TYPE=tty',
				'MOTD_SHOWN=pam',
				'HOME=/home/pi',
				'LANG=en_US',
				'LS_COLORS=rs=0:di=01;34:ln=01;36:mh=00:pi=40;33:so=01;35:do=01;35:bd=40;33;01:cd=40;33;01:or=40;31;01:mi=00:su=37;41:sg=30;43:ca=30;41:tw=30;42:ow=34;42:st=37;44:ex=01;32:*.tar=01;31:*.tgz=01;31:*.arc=01;31:*.arj=01;31:*.taz=01;31:*.lha=01;31:*.lz4=01;31:*.lzh=01;31:*.lzma=01;31:*.tlz=01;31:*.txz=01;31:*.tzo=01;31:*.t7z=01;31:*.zip=01;31:*.z=01;31:*.dz=01;31:*.gz=01;31:*.lrz=01;31:*.lz=01;31:*.lzo=01;31:*.xz=01;31:*.zst=01;31:*.tzst=01;31:*.bz2=01;31:*.bz=01;31:*.tbz=01;31:*.tbz2=01;31:*.tz=01;31:*.deb=01;31:*.rpm=01;31:*.jar=01;31:*.war=01;31:*.ear=01;31:*.sar=01;31:*.rar=01;31:*.alz=01;31:*.ace=01;31:*.zoo=01;31:*.cpio=01;31:*.7z=01;31:*.rz=01;31:*.cab=01;31:*.wim=01;31:*.swm=01;31:*.dwm=01;31:*.esd=01;31:*.jpg=01;35:*.jpeg=01;35:*.mjpg=01;35:*.mjpeg=01;35:*.gif=01;35:*.bmp=01;35:*.pbm=01;35:*.pgm=01;35:*.ppm=01;35:*.tga=01;35:*.xbm=01;35:*.xpm=01;35:*.tif=01;35:*.tiff=01;35:*.png=01;35:*.svg=01;35:*.svgz=01;35:*.mng=01;35:*.pcx=01;35:*.mov=01;35:*.mpg=01;35:*.mpeg=01;35:*.m2v=01;35:*.mkv=01;35:*.webm=01;35:*.webp=01;35:*.ogm=01;35:*.mp4=01;35:*.m4v=01;35:*.mp4v=01;35:*.vob=01;35:*.qt=01;35:*.nuv=01;35:*.wmv=01;35:*.asf=01;35:*.rm=01;35:*.rmvb=01;35:*.flc=01;35:*.avi=01;35:*.fli=01;35:*.flv=01;35:*.gl=01;35:*.dl=01;35:*.xcf=01;35:*.xwd=01;35:*.yuv=01;35:*.cgm=01;35:*.emf=01;35:*.ogv=01;35:*.ogx=01;35:*.aac=00;36:*.au=00;36:*.flac=00;36:*.m4a=00;36:*.mid=00;36:*.midi=00;36:*.mka=00;36:*.mp3=00;36:*.mpc=00;36:*.ogg=00;36:*.ra=00;36:*.wav=00;36:*.oga=00;36:*.opus=00;36:*.spx=00;36:*.xspf=00;36:',
				'SSH_CONNECTION=::1 58934 ::1 22',
				'NVM_DIR=/home/pi/.nvm',
				'XDG_SESSION_CLASS=user',
				'TERM=screen-256color',
				'USER=pi',
				'SHLVL=1',
				'NVM_CD_FLAGS=',
				'XDG_SESSION_ID=18',
				'XDG_RUNTIME_DIR=/run/user/1000',
				'SSH_CLIENT=::1 58934 22',
				'LC_ALL=en_US',
				'PATH=/home/pi/.cargo/bin:/home/pi/.nvm/versions/node/v18.16.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/games:/usr/games',
				'DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus',
				'NVM_BIN=/home/pi/.nvm/versions/node/v18.16.0/bin',
				'SSH_TTY=/dev/pts/2',
				'TEXTDOMAIN=Linux-PAM',
				'_=/usr/bin/env'
		]
		return env.join('\n')
	}
	let m = userinput.match(/touch\s+([a-zA-Z0-9/\.]+)/)
	if(m) {
		const split= m[1].split('/')
		const filename = split.pop()
		let path = split.join('/')
		if (path === '') {
			path = '.'
		}
		if(!fakeFiles[path]) {
			fakeFiles[path] = []
		}
		fakeFiles[path].push(filename)
		return ''
	}
	m = userinput.match(/^([a-zA-Z0-9_\-]+)\s+([a-zA-Z0-9\s\/\.\_\-]+)/)
	if (m) {
		const cmd = m[1]
		const args = m[2].split(' ')
		if (cmd === 'uname' && args[0] === '-a') {
			return 'Linux raspberrypi 5.10.103-v7l+ #1529 SMP Tue Mar 8 12:24:00 GMT 2022 armv7l GNU/Linux'
		} else if (cmd === 'uname' && args[0] === '-r') {
			return '5.10.103-v7l+'
		} else if (cmd === 'cd') {
			if (args[0] === '.') {
				return ''
			}
			if (args.length === 0) {
				FAKE_PWD = '/home/pi'
				return ''
			}
			if (args[0][0] == '-') {
				return `${cmd}: invalid option -- '${args[0]}'`
			}
			const path = args[0]
			if (path === '/home/pi') {
				FAKE_PWD = '/home/pi'
				return ''
			} else if (path === '/tmp') {
				FAKE_PWD = '/tmp'
				return ''
			}
			return `-bash: cd: ${args[0]}: Permission denied`
		} else if (cmd === 'rm') {
			if (args.length === 0) {
				return 'rm: missing operand'
			}
			if (args[0] === '-r' || args[0] === '-rf') {
				args.pop()
			}
			if (args[0][0] == '-') {
				return `${cmd}: invalid option -- '${args[0]}'`
			}
			let filename = args[0]
			if (filename.startsWith('./')) {
				filename = filename.substring(2)
			}
			if (fakeFiles['.'].includes(filename)) {
				const i = fakeFiles['.'].indexOf(filename)
				fakeFiles['.'].splice(i, 1)
				return ''
			}
			if (args[0][0] === '/') {
				return `rm: cannot remove '${args[0]}': Permission denied`
			}
			return `rm: cannot remove '${args[0]}': No such file or directory`
			// return "rm: remove write-protected regular fipytlehKilledon error"
		} else if (cmd === 'ls') {
			// we handle ls else where
		} else {
			return `${cmd}: invalid option -- '${args[0]}'`
		}
	}
	return false
}

const fakeOsPython = (userinput) => {
	// only checks os.system stuff
	// let importedOs = false
	let m = userinput.match(/^import\s+([a-zA-Z]+)/)
	if (m) {
		const mod = m[1]
		if (["sys", "itertools"].includes(mod)) {
			console.log("print nothing because we imported module")
			return ''
		} else if (mod === 'os') {
			// importedOs = true // checked later
		} else {
			return `ModuleNotFoundError: No module named '${mod}'`
		}
	}
	if (!/os.system\(/.test(userinput)) {
		console.log("not os cuz no os.system")
		return false
	}
	m = userinput.match(/^\import os\s*;\s*(.*)/)
	if (!m) {
		return `NameError: name 'os' is not defined`
	}
	userinput = m[1]
	m = userinput.match(/^os.system\(["']ls \s*([a-zA-Z0-9\s\/\.\_\-]+)/)
	if (m) {
		const path = m[1]
		if (path === '..') {
			return `ddnet-ircbot`
		} else if (path === '.') {
			return "env.example  hex_to_pack.py  index.js  LICENSE  node_modules  package.json  package-lock.json  ping_pong.csv  README.md  tags  venv"
		}
		return `ls: cannot open file or directory '${path}': Permission denied`
	}
	m = userinput.match(/^os.system\(["']echo ["']*([a-zA-Z0-9\s]+)\s*>>?\s*([a-zA-Z0-9\s\/\.\_\-]+)/)
	if (m) {
		const outfile = m[2]
		if (outfile[0] === '/') {
			return `-bash: ${outfile}: Permission denied`
		}
		return "" // fake successful echo write to file -> no output
	}
	m = userinput.match(/^os.system\(["']echo ["']*([a-zA-Z0-9\s]+)/)
	if (m) {
		return m[1]
	}
	m = userinput.match(/^os.system\(["']cat ["']*([a-zA-Z0-9\s\/\.\_\-]+)/)
	if (m) {
		const file = m[1]

		if (file === '/etc/passwd') {
			const content = [
				'root:x:0:0::/root:/bin/bash',
				'bin:x:1:1::/:/usr/bin/nologin',
				'daemon:x:2:2::/:/usr/bin/nologin',
				'mail:x:8:12::/var/spool/mail:/usr/bin/nologin',
				'ftp:x:14:11::/srv/ftp:/usr/bin/nologin',
				'http:x:33:33::/srv/http:/usr/bin/nologin'
			]
			return content.join('\n')
		} else if (file === '/etc/os-release') {
			const content = [
				'PRETTY_NAME="Raspbian GNU/Linux 11 (bullseye)"',
				'NAME="Raspbian GNU/Linux"',
				'VERSION_ID="11"',
				'VERSION="11 (bullseye)"'
			]
			return content.join('\n')
		} else if (file.startsWith('/usr/') ||
			file.startsWith('/boot/') ||
			file.startsWith('/dev/') ||
			file.startsWith('/etc/') ||
			file.startsWith('/home/') ||
			file.startsWith('/lib/') ||
			file.startsWith('/lib64/') ||
			file.startsWith('/lost+found/') ||
			file.startsWith('/mnt/') ||
			file.startsWith('/opt/') ||
			file.startsWith('/proc/') ||
			file.startsWith('/root/') ||
			file.startsWith('/run/') ||
			file.startsWith('/sbin/') ||
			file.startsWith('/srv/') ||
			file.startsWith('/sys/') ||
			file.startsWith('/var/') ||
			file.startsWith('/usr/')) {
			return `cat: ${file}: Permission denied`
		} else {
			return `cat: ${file}: No such file or directory`
		}
	}
	m = userinput.match(/^os.system\(["'](.+)["']/)
	if (m) {
		const fakebash = fakeBash(m[1])
		if(fakebash !== false) {
			return fakebash
		}
	}
	m = userinput.match(/^os.system\(["']([a-zA-Z0-9_\-]+)["']/)
	// command no args
	if (m) {
		const cmd = m[1]
		if (cmd === 'uname') {
			return "Linux"
		} else if (cmd === 'shutdown') {
			return `Shutdown scheduled for ${Date().toString().split('(')[0].slice(0, -1)}, use 'shutdown -c' to cancel.`
		} else if (cmd === 'sleep') {
			return 'sleep: missing operand'
		} else if (cmd === 'touch') {
			return "Try 'touch --help' for more information."
		} else if (cmd === 'ls') {
			// we handle ls else where
		} else {
			return `bash: ${cmd}: command not found`
		}
	}
	console.log("fake os EOL")
	return false
}

const fakePythonMethodCall = (userinput) => {
	const m = userinput.match(/^([a-zA-Z_]+[a-zA-Z0-9_\-]*)\(([a-zA-Z0-9'",]+)?\)/) // exit
	if (!m) {
		console.log("method call no match")
		return false
	}
	const cmd = m[1]
	let args = m[2]
	if (args) {
		args = args.split(',')
	}
	if (cmd === 'exit') {
		return ''
	}
	return false
}

const fakePythonMethodDefinition = (userinput) => {
	const m = userinput.match(/^def\s+([a-zA-Z_]+[a-zA-Z0-9_]*)\(([a-zA-Z0-9,]+)?\):$/)
	if (!m) {
		return false
	}
	console.log(m)
	const name = m[0]
	let args = m[1]
	if (args) {
		args = args.split(',')
	}
	return 'IndentationError: expected an indented block after function definition on line 1'
}

const fakePython = (userinput) => {
	let fakeoutput = fakeOsPython(userinput)
	if (fakeoutput !== false) {
		return fakeoutput
	}
	fakeoutput = fakePythonMethodCall(userinput)
	if (fakeoutput !== false) {
		return fakeoutput
	}
	fakeoutput = fakePythonMethodDefinition(userinput)
	if (fakeoutput !== false) {
		return fakeoutput
	}
	return false
}

const safePython = (userinput) => {
	let pycode = maffsPython(userinput)
	if(pycode) {
		return pycode
	}
	pycode = strPython(userinput)
	if(pycode) {
		return pycode
	}
	let m = userinput.match(/^([a-zA-Z_]+)$/)
	if (!m) {
		m = userinput.match(/^([a-zA-Z_]+)./)
	}
	if (m) {
		return `print("NameError: name '${m[1]}' is not defined")`
	}
	return 'print("failed to sanitize input")'
}

client.addListener(`message#${process.env.IRC_CHANNEL}`, async (from, message) => {
	let isBridge = false
	if (from === 'bridge') {
		const slibbers = message.split('>')
		from = slibbers[0].substr(1)
		message = slibbers.slice(1).join('>').substr(1)
		isBridge = true
	}
	console.log(`${isBridge ? '[bridge]' : ''}<${from}> ${message}`)
	if (!isBridge) {
		const ghIssueRegex = /#(\d+)/
		const match = ghIssueRegex.exec(message)
		if (match) {
			const ghUrl = `https://github.com/ddnet/ddnet/issues/${match[1]}`
			client.say(`#${process.env.IRC_CHANNEL}`, ghUrl);
		}
	}
	if (message[0] !== '!') {
		return
	}
	// delete doubled spaces
	// const words = message.substr(1).split(' ').filter((a) => a !== '') 
	const words = message.substr(1).split(' ') // keep double spaces
	const cmd = words[0] 
	const args = words.slice(1)
	if (cmd === 'help' || cmd === 'where' || cmd === 'info') {
		client.say(`#${process.env.IRC_CHANNEL}`, `https://github.com/ChillerDragon/ddnet-bot-irc eth0=${eth0} commands: !mods, !ping, !p (hex traffixc)`);
	} else if (cmd === 'mods' || cmd === 'mod' || cmd === 'moderator') {
		if(!isPapaChiler(from, isBridge, client)) {
			return
		}
		const helpTxt = await sendHelpToChiler()
		client.say(`#${process.env.IRC_CHANNEL}`, `${process.env.MOD_PING} ${helpTxt}`)
	} else if (cmd === 'js' || cmd === 'node' || cmd === 'javascript' || cmd === 'deno') {
		const unsafeUnsanitizedUserinput = args.join(' ')
		if (process.env.ALLOW_JS != '1' ) {
			client.say(`#${process.env.IRC_CHANNEL}`, 'js is turned off because i got hacked')
			return
		}
		const denoProc = spawn('deno', ['eval', unsafeUnsanitizedUserinput])
		const delay = parseInt(process.env.JS_DELAY, 10)
		denoProc.stderr.on('data', (data) => {
			client.say(`#${process.env.IRC_CHANNEL}`, 'js error')
		})
		denoProc.stdout.on('data', (data) => {
			data.toString().split('\n').forEach((line) => {
				if (!delay) {
					client.say(`#${process.env.IRC_CHANNEL}`, line)
				} else {
					setTimeout(() => {
						messageQueue.push(line)
					}, delay)
				}
			})
		});
	} else if (cmd === 'bash' || cmd === 'sh' || cmd === 'shell') {
		if (process.env.ALLOW_BASH == '0' ) {
			client.say(`#${process.env.IRC_CHANNEL}`, 'bash broken because i got hacked')
			return
		}
		const userinput = args.join(' ')
		const safe = safeBash(userinput)
		if(!safe) {
			fake = fakeBash(userinput)
			if (fake !== false) {
				const maxStdout = parseInt(process.env.MAX_STDOUT, 10)
				let numStdout = 0
				fake.toString().split('\n').forEach((line) => {
					numStdout += 1
					if (numStdout === maxStdout) { line = 'max stdout ...' }
					if (numStdout > maxStdout) { return }	

					messageQueue.push(line)
				})
			} else {
				client.say(`#${process.env.IRC_CHANNEL}`, 'unsafe bash')
			}
		}
		const shProc = spawn('bash', ['-c', safe])
		const maxStdout = parseInt(process.env.MAX_STDOUT, 10)
		let numStdout = 0
		shProc.stderr.on('data', (data) => {
			client.say(`#${process.env.IRC_CHANNEL}`, 'bash error')
		})
		shProc.stdout.on('data', (data) => {
			data.toString().split('\n').forEach((line) => {
				numStdout += 1
				if (numStdout === maxStdout) { line = 'max stdout ...' }
				if (numStdout > maxStdout) { return }	

				messageQueue.push(line)
			})
		});
	} else if (cmd === 'python' || cmd === 'py') {
		let pycode = 'print("error")'
		const userinput = args.join(' ')
		let fakeoutput = false
		let pyBin = 'python3'
		if (process.env.ALLOW_PYTHON == '1' ) {
			pycode = safePython(userinput)
			fakeoutput = fakePython(userinput)
			let m = userinput.match(/^import os;os.system\(["'](.*)["']\);?$/)
			if (m) {
				console.log("we match os sys")
				console.log(m)
				const safe = safeBash(m[1])
				if(safe) {
					fakeoutput = false
					console.log("we safe")
					pyBin = 'bash'
					pycode = safe
				}
			}
		}
		console.log(`spawn(${pyBin}, ['-c', ${pycode}])`)
		const pythonProcess = spawn(pyBin, ['-c', pycode])
		const delay = parseInt(process.env.PYTHON_DELAY, 10)
		const maxStdout = parseInt(process.env.MAX_STDOUT, 10)
		let numStdout = 0
		if(fakeoutput !== false) {
			fakeoutput.split('\n').forEach((line) => {
				numStdout += 1
				if (numStdout === maxStdout) { line = 'max stdout ...' }
				if (numStdout > maxStdout) { return }
				if (!delay) {
					client.say(`#${process.env.IRC_CHANNEL}`, line)
				} else {
					setTimeout(() => {
						messageQueue.push(line)
					}, delay)
				}
			})
		} else {
			pythonProcess.stderr.on('data', (data) => {
				client.say(`#${process.env.IRC_CHANNEL}`, 'python error')
			})
			pythonProcess.stdout.on('data', (data) => {
				data.toString().split('\n').forEach((line) => {
					numStdout += 1
					if (numStdout === maxStdout) { line = 'max stdout ...' }
					if (numStdout > maxStdout) { return }
					if (!delay) {
						client.say(`#${process.env.IRC_CHANNEL}`, line)
					} else {
						setTimeout(() => {
							messageQueue.push(line)
						}, delay)
					}
				})
			});
		}
	} else if (cmd === 'pck' || cmd === 'p' || cmd === 'packet') {
		const pythonProcess = spawn('python3', ["hex_to_pack.py", args.join(' ')])
		pythonProcess.stdout.on('data', (data) => {
			data.toString().split('\n').forEach((line) => {
				messageQueue.push(line)
			})
		});
	} else if (cmd === 'add_ping_pong') {
		if(!isPapaChiler(from, isBridge, client)) {
			return
		}
		if (args.length < 2) {
			client.say(`#${process.env.IRC_CHANNEL}`, 'usage: add_ping_ping <ping> <pong>')
			return
		}
		fs.appendFileSync('ping_pong.csv', `${args[0]}, ${args.slice(1).join(' ')}\n`);
	} else {
		const pong = checkPingPongCmd(cmd)
		if(pong) {
			client.say(`#${process.env.IRC_CHANNEL}`, pong)
		}
	}
})

client.addListener('error', (message) => {
	console.log('error: ', message)
})

const printQueue = () => {
	if (messageQueue.length <= 0) {
		return
	}
	console.log(`print queue ${messageQueue.length} items left`)
	client.say(`#${process.env.IRC_CHANNEL}`, messageQueue.shift())
}

setInterval(printQueue, 2000)

