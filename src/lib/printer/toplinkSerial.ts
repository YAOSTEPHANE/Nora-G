const PRINTER_META_KEY = 'nora-toplink-printer-meta'

/** Débits courants pour thermiques ESC/POS USB-série. */
const BAUD_CANDIDATES = [9600, 115200, 38400, 57600] as const

export type ToplinkPrinterMeta = {
  model: 'TL-R120'
  connectedAt: number | null
  lastUsedAt: number | null
  label: string
  baudRate?: number
}

type SerialPortLike = {
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  open: (options: {
    baudRate: number
    dataBits?: 7 | 8
    stopBits?: 1 | 2
    parity?: 'none' | 'even' | 'odd'
    flowControl?: 'none' | 'hardware'
  }) => Promise<void>
  close: () => Promise<void>
  getInfo?: () => { usbVendorId?: number; usbProductId?: number }
}

type SerialApi = {
  requestPort: (options?: {
    filters?: Array<{ usbVendorId?: number; usbProductId?: number }>
  }) => Promise<SerialPortLike>
  getPorts: () => Promise<SerialPortLike[]>
}

declare global {
  interface Navigator {
    serial?: SerialApi
  }
}

let activePort: SerialPortLike | null = null
let openPromise: Promise<SerialPortLike> | null = null
let discardAbort: AbortController | null = null

function readMeta(): ToplinkPrinterMeta {
  try {
    const raw = localStorage.getItem(PRINTER_META_KEY)
    if (!raw) {
      return {
        model: 'TL-R120',
        connectedAt: null,
        lastUsedAt: null,
        label: 'Toplink TL-R120',
        baudRate: 9600,
      }
    }
    const parsed = JSON.parse(raw) as Partial<ToplinkPrinterMeta>
    return {
      model: 'TL-R120',
      connectedAt:
        typeof parsed.connectedAt === 'number' ? parsed.connectedAt : null,
      lastUsedAt:
        typeof parsed.lastUsedAt === 'number' ? parsed.lastUsedAt : null,
      label:
        typeof parsed.label === 'string' && parsed.label.trim()
          ? parsed.label.trim()
          : 'Toplink TL-R120',
      baudRate:
        typeof parsed.baudRate === 'number' && parsed.baudRate > 0
          ? parsed.baudRate
          : 9600,
    }
  } catch {
    return {
      model: 'TL-R120',
      connectedAt: null,
      lastUsedAt: null,
      label: 'Toplink TL-R120',
      baudRate: 9600,
    }
  }
}

function writeMeta(patch: Partial<ToplinkPrinterMeta>): ToplinkPrinterMeta {
  const next = { ...readMeta(), ...patch, model: 'TL-R120' as const }
  try {
    localStorage.setItem(PRINTER_META_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.serial)
}

export function getToplinkPrinterMeta(): ToplinkPrinterMeta {
  return readMeta()
}

export function isToplinkPrinterLinked(): boolean {
  return activePort != null || Boolean(readMeta().connectedAt)
}

function stopDiscardReader(): void {
  discardAbort?.abort()
  discardAbort = null
}

/**
 * Vide le flux readable pour éviter que le buffer USB se sature
 * (sinon les écritures bloquent ou échouent silencieusement).
 */
function startDiscardReader(port: SerialPortLike): void {
  stopDiscardReader()
  if (!port.readable) return
  const abort = new AbortController()
  discardAbort = abort
  const reader = port.readable.getReader()
  void (async () => {
    try {
      while (!abort.signal.aborted) {
        const { done } = await reader.read()
        if (done) break
      }
    } catch {
      /* port fermé / annulé */
    } finally {
      try {
        reader.releaseLock()
      } catch {
        /* ignore */
      }
    }
  })()
}

async function closePortQuietly(port: SerialPortLike | null): Promise<void> {
  if (!port) return
  stopDiscardReader()
  try {
    await port.close()
  } catch {
    /* déjà fermé */
  }
}

async function openPortAtBaud(
  port: SerialPortLike,
  baudRate: number,
): Promise<void> {
  if (port.writable) {
    startDiscardReader(port)
    return
  }
  try {
    await port.open({
      baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Port déjà ouvert dans cet onglet / session — réutiliser.
    if (/already open/i.test(message) && port.writable) {
      startDiscardReader(port)
      return
    }
    throw err
  }
  startDiscardReader(port)
}

async function ensurePortOpen(
  port: SerialPortLike,
  preferredBaud?: number,
): Promise<{ port: SerialPortLike; baudRate: number }> {
  if (port.writable) {
    startDiscardReader(port)
    return { port, baudRate: preferredBaud ?? readMeta().baudRate ?? 9600 }
  }

  const order = [
    preferredBaud,
    ...BAUD_CANDIDATES,
  ].filter((b): b is number => typeof b === 'number' && b > 0)

  const tried = new Set<number>()
  let lastError: unknown
  for (const baud of order) {
    if (tried.has(baud)) continue
    tried.add(baud)
    try {
      await openPortAtBaud(port, baud)
      return { port, baudRate: baud }
    } catch (err) {
      lastError = err
      await closePortQuietly(port)
    }
  }

  const detail =
    lastError instanceof Error ? lastError.message : 'ouverture impossible'
  throw new Error(
    `Impossible d’ouvrir le port USB (${detail}). Vérifiez que la TL-R120 est branchée, allumée, et qu’aucun autre logiciel (pilote Windows, autre onglet) ne l’utilise.`,
  )
}

/**
 * Demande à l'utilisateur de sélectionner le port série USB de la TL-R120.
 * Chrome / Edge uniquement (API Web Serial).
 */
export async function connectToplinkPrinter(): Promise<ToplinkPrinterMeta> {
  if (!navigator.serial) {
    throw new Error(
      'Web Serial indisponible. Utilisez Chrome ou Edge sur http://localhost ou HTTPS.',
    )
  }
  await closePortQuietly(activePort)
  activePort = null

  let port: SerialPortLike
  try {
    port = await navigator.serial.requestPort()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/no port selected|not allowed|user cancelled|canceled/i.test(message)) {
      throw new Error(
        'Aucun port série sélectionné. Si la liste est vide : Windows n’expose pas de port COM pour la TL-R120 (souvent seulement « Printer POS-80 » / USB Printing). Installez le pilote POS-80 pour imprimer via Windows, ou un mode USB Virtual COM pour « Connecter USB ».',
      )
    }
    throw err instanceof Error ? err : new Error(message)
  }

  const { baudRate } = await ensurePortOpen(port, readMeta().baudRate ?? 9600)
  activePort = port
  const meta = writeMeta({
    connectedAt: Date.now(),
    lastUsedAt: Date.now(),
    baudRate,
    label: `Toplink TL-R120 (USB · ${baudRate} bauds)`,
  })
  return meta
}

/** Réutilise un port déjà autorisé par le navigateur. */
export async function reconnectToplinkPrinter(): Promise<boolean> {
  if (!navigator.serial) return false
  if (activePort?.writable) {
    startDiscardReader(activePort)
    return true
  }
  const ports = await navigator.serial.getPorts()
  if (ports.length === 0) return false

  const preferredBaud = readMeta().baudRate ?? 9600
  let lastError: unknown
  for (const port of ports) {
    try {
      const opened = await ensurePortOpen(port, preferredBaud)
      activePort = opened.port
      writeMeta({
        lastUsedAt: Date.now(),
        connectedAt: Date.now(),
        baudRate: opened.baudRate,
      })
      return true
    } catch (err) {
      lastError = err
      activePort = null
    }
  }

  if (lastError) {
    console.warn('[toplink] reconnect:', lastError)
  }
  return false
}

export async function disconnectToplinkPrinter(): Promise<void> {
  await closePortQuietly(activePort)
  activePort = null
  writeMeta({ connectedAt: null })
}

async function writeInChunks(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  data: Uint8Array,
): Promise<void> {
  const CHUNK = 256
  for (let offset = 0; offset < data.length; offset += CHUNK) {
    await writer.ready
    await writer.write(data.subarray(offset, offset + CHUNK))
  }
  await writer.ready
}

/**
 * Envoie des octets ESC/POS sur un port déjà autorisé.
 * Ne demande pas de nouveau sélecteur de port (pour l’impression vente).
 */
export async function sendRawToToplinkPrinter(data: Uint8Array): Promise<void> {
  if (openPromise) {
    await openPromise
  }
  openPromise = (async () => {
    if (activePort?.writable) return activePort
    const ok = await reconnectToplinkPrinter()
    if (!ok || !activePort?.writable) {
      throw new Error(
        'Imprimante Toplink non connectée. Cliquez « Connecter USB » dans Paramètres → Périphériques (Chrome / Edge).',
      )
    }
    return activePort
  })()

  try {
    const port = await openPromise
    if (!port.writable) {
      throw new Error('Le port de l’imprimante n’est pas accessible en écriture.')
    }
    const writer = port.writable.getWriter()
    try {
      await writeInChunks(writer, data)
      writeMeta({ lastUsedAt: Date.now() })
    } finally {
      try {
        writer.releaseLock()
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    // Port corrompu → forcer une reconnexion au prochain essai.
    await closePortQuietly(activePort)
    activePort = null
    throw err
  } finally {
    openPromise = null
  }
}
