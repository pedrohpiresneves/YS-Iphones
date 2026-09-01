/* ============================================================
   store.js — camada de dados da YS iPhone
   Usado por gestao.html (admin) e catalogo.html (vitrine).

   COMO LIGAR AO GOOGLE SHEETS:
   1. Crie uma Planilha Google nova.
   2. Na primeira aba, renomeie para "Produtos" e coloque na
      linha 1 exatamente estes cabeçalhos, nesta ordem:
      id | nome | categoria | condicao | preco | estoque | foto | ativo | criadoEm
   3. Extensões > Apps Script, apague o conteúdo e cole o código
      do arquivo apps-script.gs (enviado junto).
   4. Implantar > Nova implantação > tipo "App da Web".
      - Executar como: Eu
      - Quem pode acessar: Qualquer pessoa
   5. Copie a URL que o Google gerar (termina em /exec) e cole
      abaixo em CONFIG.SCRIPT_URL, entre aspas.
   6. Suba o site de novo. Pronto — os dois arquivos passam a
      usar a planilha como banco de dados.

   Enquanto CONFIG.SCRIPT_URL estiver vazio, o site funciona em
   MODO LOCAL: os produtos ficam salvos só neste navegador
   (localStorage), bom para testar mas não sincroniza entre
   celulares. Configure a planilha para valer para todo mundo.
============================================================ */

const CONFIG = {
  SCRIPT_URL: "", // cole aqui a URL do Apps Script (.../exec)
};

const LOCAL_KEY = "ys_iphone_produtos_v1";

const CATEGORIAS = [
  { id: "iphone", label: "iPhone" },
  { id: "ipad", label: "iPad" },
  { id: "watch", label: "Apple Watch" },
  { id: "macbook", label: "MacBook" },
  { id: "airpods", label: "AirPods" },
  { id: "jbl", label: "JBL" },
];

const ICONS = {
  iphone: '<svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="2.5"/><line x1="10" y1="19" x2="14" y2="19"/></svg>',
  ipad: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="1"/></svg>',
  watch: '<svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="14" rx="3"/><line x1="9" y1="1.5" x2="9" y2="3"/><line x1="15" y1="1.5" x2="15" y2="3"/></svg>',
  macbook: '<svg viewBox="0 0 24 24"><path d="M3 17h14v2H3zM4 5h12a2 2 0 0 1 2 2v8H2V7a2 2 0 0 1 2-2z"/></svg>',
  airpods: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="12" rx="1.5"/><path d="M2 17h20l-2 4H4z"/></svg>',
  jbl: '<svg viewBox="0 0 24 24"><path d="M9 4v11a2.5 2.5 0 1 1-2-2.4V6l9-2v9.5"/><circle cx="17" cy="15" r="2.5"/></svg>',
};

function isRemoteConfigured() {
  return CONFIG.SCRIPT_URL && CONFIG.SCRIPT_URL.trim().length > 0;
}

function seedIfEmpty() {
  const existing = localStorage.getItem(LOCAL_KEY);
  if (existing) return;
  const seed = [
    prod("iPhone 13 128GB", "iphone", "Seminovo", 2499, 3),
    prod("iPhone 14 Pro 256GB", "iphone", "Seminovo", 3999, 2),
    prod("iPhone 15 128GB", "iphone", "Lacrado", 4399, 4),
    prod("iPhone 15 Pro Max 256GB", "iphone", "Lacrado", 6999, 1),
    prod("iPad 9ª geração 64GB", "ipad", "Lacrado", 2199, 3),
    prod("iPad Air 5ª geração", "ipad", "Seminovo", 3299, 2),
    prod("Apple Watch Series 8", "watch", "Seminovo", 1599, 2),
    prod("Apple Watch SE 2ª geração", "watch", "Lacrado", 1899, 3),
    prod("MacBook Air M1", "macbook", "Seminovo", 4799, 1),
    prod("MacBook Air M2", "macbook", "Lacrado", 6999, 1),
    prod("AirPods Pro 2", "airpods", "Lacrado", 1399, 5),
    prod("AirPods 3ª geração", "airpods", "Lacrado", 999, 4),
    prod("JBL Charge 5", "jbl", "Lacrado", 899, 3),
    prod("JBL Flip 6", "jbl", "Lacrado", 699, 3),
  ];
  localStorage.setItem(LOCAL_KEY, JSON.stringify(seed));
}

function prod(nome, categoria, condicao, preco, estoque) {
  return {
    id: "p" + Math.random().toString(36).slice(2, 10),
    nome, categoria, condicao, preco, estoque,
    foto: "",
    ativo: true,
    criadoEm: new Date().toISOString(),
  };
}

function getLocalProducts() {
  seedIfEmpty();
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function setLocalProducts(list) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
}

/* ---------- API pública ---------- */

async function fetchProducts() {
  if (isRemoteConfigured()) {
    try {
      const res = await fetch(CONFIG.SCRIPT_URL);
      const data = await res.json();
      return data.produtos || [];
    } catch (e) {
      console.error("Falha ao buscar produtos da planilha, usando modo local.", e);
      return getLocalProducts();
    }
  }
  return getLocalProducts();
}

async function saveProduct(produto) {
  if (isRemoteConfigured()) {
    return remoteRequest({ action: produto.id ? "update" : "create", produto });
  }
  const list = getLocalProducts();
  if (produto.id) {
    const idx = list.findIndex((p) => p.id === produto.id);
    if (idx >= 0) list[idx] = produto;
  } else {
    produto.id = "p" + Math.random().toString(36).slice(2, 10);
    produto.criadoEm = new Date().toISOString();
    list.push(produto);
  }
  setLocalProducts(list);
  return produto;
}

async function deleteProduct(id) {
  if (isRemoteConfigured()) {
    return remoteRequest({ action: "delete", produto: { id } });
  }
  const list = getLocalProducts().filter((p) => p.id !== id);
  setLocalProducts(list);
}

/* ---------- vendas (controle financeiro) ---------- */

const LOCAL_SALES_KEY = "ys_iphone_vendas_v1";

function getLocalSales() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_SALES_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function setLocalSales(list) {
  localStorage.setItem(LOCAL_SALES_KEY, JSON.stringify(list));
}

// Registra a venda (com o valor realmente cobrado) e desconta 1
// unidade do estoque do produto. Se o estoque zerar, o produto
// deixa de aparecer como ativo automaticamente.
async function registerSale(produto, precoVenda) {
  const venda = {
    id: "v" + Math.random().toString(36).slice(2, 10),
    produtoId: produto.id,
    nome: produto.nome,
    categoria: produto.categoria,
    condicao: produto.condicao,
    precoTabela: Number(produto.preco),
    precoVenda: Number(precoVenda),
    vendidoEm: new Date().toISOString(),
  };

  const novoEstoque = Math.max(0, Number(produto.estoque) - 1);
  const produtoAtualizado = {
    ...produto,
    estoque: novoEstoque,
    ativo: novoEstoque > 0 ? produto.ativo : false,
  };

  if (isRemoteConfigured()) {
    await remoteRequest({ action: "sale", venda });
    await remoteRequest({ action: "update", produto: produtoAtualizado });
  } else {
    const sales = getLocalSales();
    sales.push(venda);
    setLocalSales(sales);
    const list = getLocalProducts();
    const idx = list.findIndex((p) => p.id === produto.id);
    if (idx >= 0) list[idx] = produtoAtualizado;
    setLocalProducts(list);
  }
  return venda;
}

async function fetchSales() {
  if (isRemoteConfigured()) {
    try {
      const res = await fetch(CONFIG.SCRIPT_URL);
      const data = await res.json();
      return data.vendas || [];
    } catch (e) {
      console.error("Falha ao buscar vendas da planilha, usando modo local.", e);
      return getLocalSales();
    }
  }
  return getLocalSales();
}

// Truque necessário porque o Apps Script não responde bem a
// pré-verificações CORS: manda o corpo como texto simples.
async function remoteRequest(payload) {
  const res = await fetch(CONFIG.SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

function formatPrice(n) {
  return "R$ " + Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 0 });
}
