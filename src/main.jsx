import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { DB } from "./catalogo.js";
const CART_KEY = "x7_cart_pwa_v1";

const NUMBER_WORDS = {
  UM: 1, UMA: 1, DOIS: 2, DUAS: 2, TRES: 3, QUATRO: 4, CINCO: 5,
  SEIS: 6, MEIA: 6, SETE: 7, OITO: 8, NOVE: 9, DEZ: 10, ONZE: 11, DOZE: 12,
  VINTE: 20, TRINTA: 30, QUARENTA: 40, CINQUENTA: 50, CEM: 100
};

function normalize(text) {
  return String(text || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Ã—/g, "X")
    .replace(/[^0-9A-Z\sX.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findItems(query, category = "TODOS", limit = 12) {
  const clean = normalize(query);
  const compact = clean.replace(/[^0-9A-Z]/g, "");
  const numbers = (clean.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => Number(n.replace(",", ".")));

  return DB
    .filter((item) => category === "TODOS" || item.categoria === category)
    .map((item) => {
      const code = normalize(item.codigo).replace(/[^0-9A-Z]/g, "");
      const dims = [item.interna, item.externa, item.largura];
      let score = 0;

      if (code === compact) score += 1000;
      else if (code.startsWith(compact) && compact.length > 0) score += 500;
      else if (code.includes(compact) && compact.length > 1) score += 260;

      numbers.forEach((number, index) => {
        if (dims[index] === number) score += 90 - index * 12;
        if (dims.includes(number)) score += 30;
      });

      if (normalize(item.tipo).includes(clean)) score += 20;
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);
}

function extractQuantity(command) {
  const clean = normalize(command);
  const number = clean.match(/\b(?:ADICIONAR|ADICIONA|COLOCAR|COLOCA|POE|INCLUIR|INCLUI)\s+(\d+)\b/);
  if (number) return Number(number[1]);

  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b(?:ADICIONAR|ADICIONA|COLOCAR|COLOCA|POE|INCLUIR|INCLUI)\\s+${word}\\b`).test(clean)) {
      return value;
    }
  }

  return 1;
}

function categoryFromCommand(command) {
  const clean = normalize(command);
  if (clean.includes("RETENTOR")) return "RETENTOR";
  if (clean.includes("ROLAMENTO")) return "ROLAMENTO";
  return "TODOS";
}

function isAddCommand(command) {
  return /\b(ADICIONAR|ADICIONA|COLOCAR|COLOCA|POE|INCLUIR|INCLUI)\b/.test(normalize(command));
}

function buildMessage(cart) {
  const total = cart.reduce((sum, item) => sum + item.qty, 0);
  const lines = ["*Lista de Compras - X7 Rolamentos & Retentores*", ""];
  cart.forEach((item, index) => {
    lines.push(`${index + 1}. *[${item.categoria}]* ${item.codigo}`);
    lines.push(`   Medidas: ${item.interna}x${item.externa}x${item.largura} mm`);
    lines.push(`   ${item.tipo}`);
    lines.push(`   *Qtd: ${item.qty}*`, "");
  });
  lines.push(`Total: ${total} peca${total === 1 ? "" : "s"} em ${cart.length} item${cart.length === 1 ? "" : "s"}`);
  return lines.join("\n");
}

function App() {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState("TODOS");
  const [selected, setSelected] = React.useState(null);
  const [qty, setQty] = React.useState(1);
  const [cart, setCart] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [status, setStatus] = React.useState("Pronto para buscar por texto ou voz.");
  const [listening, setListening] = React.useState(false);
  const [canInstall, setCanInstall] = React.useState(false);
  const installPromptRef = React.useRef(null);
  const recognitionRef = React.useRef(null);
  const continuousVoiceRef = React.useRef(false);

  React.useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  React.useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(new URL("sw.js", window.location.href)).catch(() => {
        setStatus("Offline nao ativado neste navegador.");
      });
    }

    const beforeInstall = (event) => {
      event.preventDefault();
      installPromptRef.current = event;
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", beforeInstall);
  }, []);

  const results = React.useMemo(() => {
    if (!query.trim()) return DB.filter((item) => filter === "TODOS" || item.categoria === filter).slice(0, 24);
    return findItems(query, filter, 16);
  }, [filter, query]);

  function addToCart(item = selected, amount = qty) {
    if (!item || amount < 1) return;
    setCart((items) => {
      const found = items.find((cartItem) => cartItem.codigo === item.codigo);
      if (found) {
        return items.map((cartItem) => cartItem.codigo === item.codigo ? { ...cartItem, qty: cartItem.qty + amount } : cartItem);
      }
      return [...items, { ...item, qty: amount }];
    });
    setStatus(`${item.codigo} adicionado na lista.`);
  }

  function changeQty(code, amount) {
    setCart((items) => items
      .map((item) => item.codigo === code ? { ...item, qty: item.qty + amount } : item)
      .filter((item) => item.qty > 0));
  }

  function processVoiceTranscript(transcript) {
    const commandCategory = categoryFromCommand(transcript);
    const match = findItems(transcript, commandCategory, 1)[0];
    setQuery(transcript);

    if (!match) {
      setStatus(`Ouvi "${transcript}", mas nao encontrei item cadastrado.`);
      return;
    }

    setSelected(match);

    if (isAddCommand(transcript)) {
      const amount = extractQuantity(transcript);
      addToCart(match, amount);
      setStatus(`Adicionado automaticamente: ${amount}x ${match.codigo}.`);
      return;
    }

    setStatus(`Ouvi "${transcript}" e encontrei ${match.codigo}. Diga "adicionar" para colocar na lista.`);
  }

  function startVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatus("Voz indisponivel. Use Chrome ou Edge, ou pesquise pelo campo.");
      return;
    }
    recognitionRef.current?.stop();
    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.continuous = true;
    recognition.onstart = () => {
      setListening(true);
      setStatus("Voz continua ativa. Pode falar os itens.");
    };
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      processVoiceTranscript(result[0].transcript);
    };
    recognition.onerror = () => setStatus("Nao consegui ouvir. Tente novamente.");
    recognition.onend = () => {
      setListening(false);
      if (continuousVoiceRef.current) {
        window.setTimeout(() => {
          try {
            recognition.start();
          } catch {
            setStatus("Voz pausada pelo navegador. Toque para ativar de novo.");
          }
        }, 350);
      }
    };
    recognitionRef.current = recognition;
    continuousVoiceRef.current = true;
    recognition.start();
  }

  function stopVoice() {
    continuousVoiceRef.current = false;
    recognitionRef.current?.stop();
    setListening(false);
    setStatus("Voz parada.");
  }

  const message = buildMessage(cart);
  const whatsUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">X7 Assistente</p>
          <h1>Rolamentos & Retentores</h1>
        </div>
        <div className="top-actions">
          {canInstall && (
            <button className="ghost-button" onClick={() => installPromptRef.current?.prompt()}>
              Instalar app
            </button>
          )}
          <span className="offline-pill">Offline ready</span>
        </div>
      </header>

      <section className="search-panel" aria-live="polite">
        <div className="mic-box">
          <button className={`mic-button ${listening ? "is-listening" : ""}`} onClick={listening ? stopVoice : startVoice} aria-label="Ativar ou parar voz continua">
            <span />
          </button>
          <div>
            <strong>{status}</strong>
            <p>Diga: adicionar rolamento 6203, adicionar 2 retentores TC 17 por 40 por 7, ou apenas rolamento 6205 para buscar.</p>
          </div>
        </div>

        <div className="search-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar codigo ou medida..."
            autoComplete="off"
            inputMode="search"
          />
          <button className="primary-button" onClick={() => setSelected(results[0] || null)}>Buscar</button>
          <button className="ghost-button" onClick={listening ? stopVoice : startVoice}>
            {listening ? "Parar voz" : "Ativar voz continua"}
          </button>
        </div>

        <div className="filters" role="tablist" aria-label="Filtro de categoria">
          {["TODOS", "ROLAMENTO", "RETENTOR"].map((item) => (
            <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
              {item === "TODOS" ? "Todos" : item.toLowerCase()}
            </button>
          ))}
        </div>
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-head">
            <h2>Resultados</h2>
            <span>{results.length} encontrados</span>
          </div>
          <div className="result-list">
            {results.map((item) => (
              <button className="result-item" key={item.codigo} onClick={() => setSelected(item)}>
                <span className={item.categoria === "ROLAMENTO" ? "badge bearing" : "badge seal"}>{item.categoria}</span>
                <strong>{item.codigo}</strong>
                <small>{item.interna}x{item.externa}x{item.largura} mm</small>
                <em>{item.tipo}</em>
              </button>
            ))}
          </div>
        </article>

        <article className="panel selected-panel">
          <div className="panel-head">
            <h2>Item selecionado</h2>
          </div>
          {selected ? (
            <>
              <span className={selected.categoria === "ROLAMENTO" ? "badge bearing" : "badge seal"}>{selected.categoria}</span>
              <h3>{selected.codigo}</h3>
              <p>{selected.tipo}</p>
              <div className="measure-grid">
                <div><span>Interna</span><strong>{selected.interna}</strong><small>mm</small></div>
                <div><span>Externa</span><strong>{selected.externa}</strong><small>mm</small></div>
                <div><span>Largura</span><strong>{selected.largura}</strong><small>mm</small></div>
              </div>
              <div className="add-row">
                <input type="number" min="1" max="999" value={qty} onChange={(event) => setQty(Number(event.target.value) || 1)} aria-label="Quantidade" />
                <button className="primary-button" onClick={() => addToCart()}>Adicionar na lista</button>
              </div>
            </>
          ) : (
            <p className="empty">Selecione um resultado para adicionar na lista.</p>
          )}
        </article>
      </section>

      <section className="panel cart-panel">
        <div className="panel-head">
          <h2>Lista de compras</h2>
          <button className="ghost-button" onClick={() => setCart([])} disabled={cart.length === 0}>Limpar</button>
        </div>
        {cart.length === 0 ? (
          <p className="empty">A lista ainda esta vazia.</p>
        ) : (
          <div className="cart-list">
            {cart.map((item) => (
              <div className="cart-item" key={item.codigo}>
                <div>
                  <span className={item.categoria === "ROLAMENTO" ? "badge bearing" : "badge seal"}>{item.categoria}</span>
                  <strong>{item.codigo}</strong>
                  <small>{item.interna}x{item.externa}x{item.largura} mm - {item.tipo}</small>
                </div>
                <div className="qty-controls">
                  <button onClick={() => changeQty(item.codigo, -1)} aria-label={`Diminuir ${item.codigo}`}>-</button>
                  <strong>{item.qty}</strong>
                  <button onClick={() => changeQty(item.codigo, 1)} aria-label={`Aumentar ${item.codigo}`}>+</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="share-row">
          <button
            className="ghost-button"
            disabled={cart.length === 0}
            onClick={() => navigator.clipboard?.writeText(message).then(() => setStatus("Lista copiada."))}
          >
            Copiar lista
          </button>
          <a className={`whatsapp-button ${cart.length === 0 ? "disabled" : ""}`} href={cart.length ? whatsUrl : "#"} target="_blank" rel="noreferrer">
            Enviar no WhatsApp
          </a>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);


