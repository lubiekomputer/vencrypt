import { ChatBarButton } from "@api/ChatButtons";
import * as MessageEvents from "@api/MessageEvents";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { Button, Forms, React, showToast, TextInput, Toasts } from "@webpack/common";

const PREFIX = "🔐ENC1:";
const PBKDF2_ITERATIONS = 200_000;
const SALT_LEN = 16;
const IV_LEN = 12;

const te = new TextEncoder();
const td = new TextDecoder();

const toB64 = (buf: Uint8Array) => {
    let s = "";
    for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
    return btoa(s);
};
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

const keyCache = new Map<string, CryptoKey>();

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const id = password + "|" + toB64(salt);
    const cached = keyCache.get(id);
    if (cached) return cached;

    const baseKey = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
    if (keyCache.size > 200) keyCache.clear();
    keyCache.set(id, key);
    return key;
}

async function encryptText(plain: string, password: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
    const key = await deriveKey(password, salt);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, te.encode(plain)));

    const out = new Uint8Array(SALT_LEN + IV_LEN + ct.length);
    out.set(salt, 0);
    out.set(iv, SALT_LEN);
    out.set(ct, SALT_LEN + IV_LEN);
    return PREFIX + toB64(out);
}

async function decryptText(payload: string, password: string): Promise<string | null> {
    try {
        const raw = fromB64(payload.slice(PREFIX.length).trim());
        const salt = raw.slice(0, SALT_LEN);
        const iv = raw.slice(SALT_LEN, SALT_LEN + IV_LEN);
        const ct = raw.slice(SALT_LEN + IV_LEN);
        const key = await deriveKey(password, salt);
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
        return td.decode(plain);
    } catch {
        return null; 
    }
}


const settings = definePluginSettings({
    password: {
        type: OptionType.STRING,
        description: "Klucz szyfrowania (możesz go też wpisać w okienku z ikonką klucza)",
        default: "",
        hidden: true
    }
});

let encryptEnabled = false;
const subscribers = new Set<() => void>();
const setEnabled = (v: boolean) => {
    encryptEnabled = v;
    subscribers.forEach(fn => fn());
};


function LockIcon({ locked }: { locked: boolean; }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            {locked
                ? <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z" />
                : <path d="M12 2a5 5 0 0 0-5 5v1h2V7a3 3 0 0 1 6 0v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Z" opacity=".6" />}
        </svg>
    );
}

function KeyIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M7 14a4 4 0 1 1 3.87-5H21v3h-2v2h-3v-2h-5.13A4 4 0 0 1 7 14Zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
        </svg>
    );
}

function KeyModal({ modalProps }: { modalProps: ModalProps; }) {
    const [value, setValue] = React.useState(settings.store.password ?? "");

    const save = () => {
        settings.store.password = value;
        keyCache.clear();
        showToast(value ? "Klucz zapisany" : "Klucz usunięty", Toasts.Type.SUCCESS);
        modalProps.onClose();
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.SMALL}>
            <ModalHeader>
                <Forms.FormTitle tag="h2" style={{ flexGrow: 1, margin: 0 }}>Klucz szyfrowania</Forms.FormTitle>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent>
                <Forms.FormText style={{ marginBottom: 12 }}>
                    Obie strony muszą wpisać dokładnie ten sam klucz. Im dłuższe i bardziej losowe hasło, tym trudniej je złamać.
                </Forms.FormText>
                <TextInput
                    type="password"
                    placeholder="Wpisz klucz..."
                    value={value}
                    onChange={setValue}
                    autoFocus
                />
            </ModalContent>
            <ModalFooter>
                <Button onClick={save}>Zapisz</Button>
            </ModalFooter>
        </ModalRoot>
    );
}

function ChatBarControls() {
    const [, force] = React.useReducer((x: number) => x + 1, 0);

    React.useEffect(() => {
        subscribers.add(force);
        return () => void subscribers.delete(force);
    }, []);

    return (
        <>
            <ChatBarButton
                tooltip="Ustaw klucz szyfrowania"
                onClick={() => openModal(props => <KeyModal modalProps={props} />)}
            >
                <KeyIcon />
            </ChatBarButton>
            <ChatBarButton
                tooltip={encryptEnabled ? "Szyfrowanie WŁĄCZONE (kliknij, by wyłączyć)" : "Szyfrowanie wyłączone (kliknij, by włączyć)"}
                onClick={() => setEnabled(!encryptEnabled)}
            >
                <span style={{ color: encryptEnabled ? "var(--green-360, #3ba55d)" : undefined, display: "flex" }}>
                    <LockIcon locked={encryptEnabled} />
                </span>
            </ChatBarButton>
        </>
    );
}

const decryptedCache = new Map<string, string | null>();

function DecryptedAccessory({ content }: { content: string; }) {
    const { password } = settings.use(["password"]);
    const cacheKey = password + "|" + content;
    const [result, setResult] = React.useState<string | null | undefined>(decryptedCache.get(cacheKey));

    React.useEffect(() => {
        let alive = true;
        if (!password) {
            setResult(null);
            return;
        }
        if (decryptedCache.has(cacheKey)) {
            setResult(decryptedCache.get(cacheKey));
            return;
        }
        decryptText(content, password).then(text => {
            if (decryptedCache.size > 500) decryptedCache.clear();
            decryptedCache.set(cacheKey, text);
            if (alive) setResult(text);
        });
        return () => { alive = false; };
    }, [content, password]);

    if (result === undefined) return <div style={{ opacity: 0.6, fontSize: 13 }}>🔐 odszyfrowywanie…</div>;

    if (result === null) {
        return (
            <div style={{ opacity: 0.7, fontSize: 13, fontStyle: "italic" }}>
                🔒 Zaszyfrowana wiadomość – brak klucza lub zły klucz
            </div>
        );
    }

    return (
        <div style={{
            borderLeft: "3px solid var(--green-360, #3ba55d)",
            paddingLeft: 8,
            marginTop: 4,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: "#ffffff"
        }}>
            <div style={{ fontSize: 11, opacity: 0.6 }}>🔓 odszyfrowano</div>
            {result}
        </div>
    );


}

async function sendListener(_channelId: string, msg: { content: string; }) {
    console.log("[vencrypt] wysyłanie, szyfrowanie:", encryptEnabled);
    if (!encryptEnabled || !msg.content || msg.content.startsWith(PREFIX)) return;

    const password = settings.store.password;
    if (!password) {
        showToast("Najpierw ustaw klucz (ikonka klucza)!", Toasts.Type.FAILURE);
        return { cancel: true };
    }

    const encrypted = await encryptText(msg.content, password);
    if (encrypted.length > 2000) {
        showToast("Wiadomość po zaszyfrowaniu przekracza limit 2000 znaków – skróć ją.", Toasts.Type.FAILURE);
        return { cancel: true };
    }

    msg.content = encrypted;
}


export default definePlugin({
    name: "vencrypt",
    description: "Szyfruje wysyłane wiadomości (AES-256-GCM) kluczem z okienka i odszyfrowuje wiadomości innych użytkowników pluginu.",
    authors: [{ name: "you", id: 0n }],
    settings,

    chatBarButton: {
        icon: LockIcon as any,
        render: () => <ChatBarControls />
    },

    start() {
        const add = (MessageEvents as any)["addMessagePreSendListener"] ?? (MessageEvents as any)["addPreSendListener"];
        if (!add) {
            console.error("[vencrypt] Nie znaleziono API pre-send w MessageEvents!", Object.keys(MessageEvents));
            return;
        }
        add(sendListener);
        console.log("[vencrypt] listener zarejestrowany");
    },

    stop() {
        const remove = (MessageEvents as any)["removeMessagePreSendListener"] ?? (MessageEvents as any)["removePreSendListener"];
        remove?.(sendListener);
    },

    renderMessageAccessory(props: any) {
        const content: string | undefined = props?.message?.content;
        if (!content || !content.startsWith(PREFIX)) return null;

        return (
            <ErrorBoundary noop>
                <DecryptedAccessory content={content} />
            </ErrorBoundary>
        );
    }
});
