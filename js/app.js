(function () {
  const PAGE = 40;
  const CATS = [
    "전체",
    "세제·살균",
    "화장품·향료",
    "플라스틱·가소제",
    "식품첨가물",
    "실내공기·용제",
    "코팅·PFAS",
    "살충·방충",
    "중금속·원소",
    "페인트·접착·난연",
    "섬유·염색",
    "일반 화합물"
  ];

  const state = {
    catalog: [],
    index: null,
    query: "",
    cat: "전체",
    page: 0,
    lastView: "home"
  };

  const $ = (id) => document.getElementById(id);

  function views() {
    return {
      home: $("view-home"),
      results: $("view-results"),
      browse: $("view-browse"),
      detail: $("view-detail"),
      guide: $("view-guide")
    };
  }

  function show(name) {
    const v = views();
    Object.entries(v).forEach(([k, el]) => {
      if (el) el.hidden = k !== name;
    });
    if (name !== "detail") state.lastView = name;
  }

  function normalize(s) {
    return (s || "").toString().toLowerCase().replace(/\s+/g, " ").trim();
  }

  function aliasesOf(item) {
    const extra = [];
    const enc = findEncyclopedia(item);
    if (enc) extra.push(enc.nameKo, enc.name, ...(enc.aliases || []));
    return [item.n, item.k, item.c, item.f, ...(item.a || []), ...extra].filter(Boolean);
  }

  function findEncyclopedia(item) {
    const list = window.ENCYCLOPEDIA || [];
    const keys = [item.c, item.n, item.k, ...(item.a || [])].map(normalize);
    return list.find((e) => {
      const bag = [e.cas, e.name, e.nameKo, ...(e.aliases || [])].map(normalize);
      return keys.some((k) => k && bag.includes(k));
    });
  }

  function findEncyclopediaByQuery(q) {
    const n = normalize(q);
    return (window.ENCYCLOPEDIA || []).find((e) => {
      const bag = [e.cas, e.name, e.nameKo, ...(e.aliases || [])].map(normalize);
      return bag.some((b) => b === n || b.includes(n) || n.includes(b));
    });
  }

  function matchItem(item, q) {
    if (!q) return true;
    return aliasesOf(item).some((a) => normalize(a).includes(q));
  }

  function filtered() {
    const q = normalize(state.query);
    return state.catalog.filter((item) => {
      if (state.cat !== "전체" && item.g !== state.cat) return false;
      return matchItem(item, q);
    });
  }

  function featured() {
    const names = ["락스", "BPA", "포름알데히드", "DEHP", "PFOA", "벤젠", "파라벤", "SLS"];
    return names
      .map((n) => {
        const enc = findEncyclopediaByQuery(n);
        if (!enc) return null;
        return (
          state.catalog.find((it) => it.c === enc.cas) || {
            n: enc.name,
            k: enc.nameKo,
            c: enc.cas,
            f: enc.formula,
            g: enc.category,
            a: enc.aliases,
            d: enc.summary
          }
        );
      })
      .filter(Boolean);
  }

  function renderHome() {
    $("home-cats").innerHTML = CATS.filter((c) => c !== "전체")
      .map((c) => `<button class="chip" data-cat="${c}">${c}</button>`)
      .join("");
    $("featured-list").innerHTML = featured()
      .map(
        (it) => `<button class="mini-card" data-open="${encodeURIComponent(it.c || it.n)}">
          <b>${it.k || it.n}</b>
          <div class="meta">${it.n}</div>
          <span class="badge">${it.g || ""}</span>
        </button>`
      )
      .join("");
  }

  function resultCard(it) {
    const title = it.k || it.n;
    const sub = [it.n, it.c, it.f].filter(Boolean).join(" · ");
    return `<button class="result" data-open="${encodeURIComponent(it.c || it.n)}">
      <b>${title}</b>
      <div class="meta">${sub}</div>
      <span class="badge">${it.g || "화합물"}</span>
    </button>`;
  }

  function renderResults(title) {
    const rows = filtered().slice(0, 80);
    $("results-title").textContent = title || `‘${state.query}’ 검색 결과`;
    $("results-meta").textContent = `${rows.length}건 표시 · 전체 색인 ${state.catalog.length.toLocaleString()}종`;
    $("results-list").innerHTML = rows.length
      ? rows.map(resultCard).join("")
      : `<p>로컬 색인에 없습니다. 아래에서 PubChem으로 찾아 상세 정보를 엽니다.</p>
         <button class="result" data-open="${encodeURIComponent(state.query)}"><b>${state.query}</b><div class="meta">외부 검색</div></button>`;
    show("results");
  }

  function renderBrowse() {
    const sel = $("cat-filter");
    if (!sel.options.length) {
      CATS.forEach((c) => {
        const o = document.createElement("option");
        o.value = c;
        o.textContent = c;
        sel.appendChild(o);
      });
    }
    sel.value = state.cat;
    const rows = filtered();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (state.page >= pages) state.page = 0;
    const slice = rows.slice(state.page * PAGE, state.page * PAGE + PAGE);
    $("browse-list").innerHTML = slice.map(resultCard).join("");
    $("page-info").textContent = `${(state.page + 1).toLocaleString()} / ${pages.toLocaleString()} · ${rows.length.toLocaleString()}종`;
    show("browse");
  }

  function suggest(q) {
    const box = $("suggest");
    if (!q || q.length < 1) {
      box.hidden = true;
      return;
    }
    const n = normalize(q);
    const hits = state.catalog.filter((it) => matchItem(it, n)).slice(0, 8);
    if (!hits.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.innerHTML = hits
      .map(
        (it, i) =>
          `<li class="${i === 0 ? "active" : ""}" data-open="${encodeURIComponent(it.c || it.n)}"><span>${it.k || it.n}</span><small>${it.n}</small></li>`
      )
      .join("");
  }

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("network");
    return res.json();
  }

  async function pubchemBy(term) {
    const encoded = encodeURIComponent(term);
    const cidUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encoded}/cids/JSON`;
    try {
      const data = await fetchJson(cidUrl);
      const cid = data?.IdentifierList?.CID?.[0];
      if (!cid) return null;
      const prop = await fetchJson(
        `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/Title,MolecularFormula,MolecularWeight,IUPACName,CanonicalSMILES/JSON`
      );
      const p = prop?.PropertyTable?.Properties?.[0] || {};
      let view = null;
      try {
        view = await fetchJson(
          `https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/${cid}/JSON?heading=GHS%20Classification`
        );
      } catch (_) {
        view = null;
      }
      return { cid, p, view };
    } catch (_) {
      return null;
    }
  }

  function extractHCodes(view) {
    const text = JSON.stringify(view || {});
    const codes = [...text.matchAll(/\bH\d{3}\b/g)].map((m) => m[0]);
    return [...new Set(codes)];
  }

  function classKeyFrom(item, enc) {
    if (enc?.classKey) return enc.classKey;
    const blob = `${item.n} ${item.k || ""} ${item.g || ""} ${item.d || ""}`.toLowerCase();
    if (/phthalate/.test(blob)) return "phthalate";
    if (/paraben/.test(blob)) return "paraben";
    if (/perfluoro|pfas|pfoa|pfos/.test(blob)) return "pfas";
    if (/bisphenol/.test(blob)) return "bisphenol";
    if (/formaldehyde|aldehyde/.test(blob)) return "aldehyde";
    if (/lead|mercury|cadmium|arsenic|nickel/.test(blob)) return "heavy-metal";
    if (/toluene|xylene|benzene|solvent|acetone/.test(blob)) return "voc";
    if (/hypochlorite|bleach|peroxide/.test(blob)) return "bleach";
    if (/surfactant|lauryl|laureth/.test(blob)) return "surfactant";
    if (/permethrin|pyrethroid|pesticide/.test(blob)) return "pyrethroid";
    if (/nitrite/.test(blob)) return "nitrite";
    if (/polyethylene|polystyrene|polymer/.test(blob)) return "microplastic";
    return "default";
  }

  function pill(code) {
    const info = window.GHS_KO?.[code];
    const level = info?.level || "info";
    return `<span class="pill ${level}">${code} ${info ? info.title : ""}</span>`;
  }

  function organBlocks(enc) {
    if (!enc?.organs) return "";
    return `<div class="organs">${Object.entries(enc.organs)
      .map(([k, v]) => `<div class="organ"><h3>${k}</h3><p>${v}</p></div>`)
      .join("")}</div>`;
  }

  async function openDetail(key) {
    show("detail");
    const decoded = decodeURIComponent(key);
    const qn = normalize(decoded);
    const item =
      state.catalog.find((it) => [it.c, it.n, it.k, ...(it.a || [])].some((x) => normalize(x) === qn)) ||
      state.catalog.find((it) => matchItem(it, qn)) || {
        n: decoded,
        k: null,
        c: null,
        f: null,
        g: "검색",
        d: ""
      };
    const enc = findEncyclopedia(item) || findEncyclopediaByQuery(decoded);
    $("dossier").innerHTML = `<p class="loading">PubChem에서 위험분류와 화학 정보를 불러오는 중…</p>`;

    const lookup = enc?.cas || item.c || enc?.name || item.n || decoded;
    const pc = await pubchemBy(lookup);
    const hcodes = extractHCodes(pc?.view);
    const cls = window.CLASS_EFFECTS[classKeyFrom(item, enc)] || window.CLASS_EFFECTS.default;
    const title = enc?.nameKo || item.k || pc?.p?.Title || item.n;
    const formula = enc?.formula || item.f || pc?.p?.MolecularFormula || "—";
    const cas = enc?.cas || item.c || "—";
    const img = pc?.cid
      ? `https://pubchem.ncbi.nlm.nih.gov/image/imgsrv.fcgi?cid=${pc.cid}&t=l`
      : "";

    const ghsHtml = hcodes.length
      ? hcodes
          .map((code) => {
            const info = window.GHS_KO[code];
            if (!info) return `<div class="organ"><h3>${code}</h3><p>GHS 위험 코드입니다. 원문 분류를 참고하세요.</p></div>`;
            return `<div class="organ"><h3>${code} · ${info.title}</h3><p>${info.body}</p></div>`;
          })
          .join("")
      : `<p>이 물질은 PubChem GHS 문구가 없거나 분류가 아직 없습니다. 아래 계열 설명과 물리화학 정보를 함께 보세요.</p>`;

    $("dossier").innerHTML = `
      <button class="back" id="back-btn">← 목록으로</button>
      <div class="dossier-head">
        ${img ? `<img src="${img}" alt="${title} 구조">` : "<div></div>"}
        <div>
          <p class="kicker">${enc?.category || item.g || "화합물"}</p>
          <h1>${title}</h1>
          <p class="formula">${formula}</p>
          <p class="meta">${enc?.name || item.n} · CAS ${cas}${pc?.p?.MolecularWeight ? " · " + pc.p.MolecularWeight + " g/mol" : ""}</p>
          <div class="hazard-row">${hcodes.slice(0, 8).map(pill).join("")}</div>
        </div>
      </div>
      <p>${enc?.summary || item.d || "일상에서 이름만 보고도 찾을 수 있게 색인한 화합물입니다. 인체 영향은 계열 특성과 GHS 분류를 함께 해석하세요."}</p>

      <section class="section">
        <h2>어디에 쓰이나</h2>
        <p>${(enc?.products || []).join(", ") || item.p || "산업 원료·연구용·소비자 제품 첨가제 중 하나로 등장할 수 있습니다. 제품 성분표의 INCI/CAS와 대조하세요."}</p>
      </section>

      <section class="section">
        <h2>노출 경로</h2>
        <p>${(enc?.exposure || ["피부 접촉", "흡입", "섭취"]).join(" · ")}</p>
      </section>

      <section class="section">
        <h2>인체에 미치는 영향</h2>
        <p><strong>계열 특성 (${cls.name})</strong> — ${cls.body}</p>
        ${enc?.acute ? `<p><strong>급성.</strong> ${enc.acute}</p>` : ""}
        ${enc?.chronic ? `<p><strong>만성.</strong> ${enc.chronic}</p>` : ""}
        ${organBlocks(enc)}
      </section>

      <section class="section">
        <h2>GHS 위험문구를 풀어 읽기</h2>
        <div class="organs">${ghsHtml}</div>
      </section>

      ${
        enc?.mixDanger
          ? `<section class="section"><h2>섞으면 위험한 것</h2><div class="callout">${enc.mixDanger}</div></section>`
          : ""
      }

      <section class="section">
        <h2>더 취약한 사람</h2>
        <p>${enc?.vulnerable || "어린이, 임신부, 만성 호흡기·피부질환자는 같은 농도에도 증상이 먼저 나타나는 경우가 많습니다."}</p>
      </section>

      <section class="section">
        <h2>규제와 일상 수칙</h2>
        <p>${enc?.regulation || "국가·용도마다 허용 농도가 다릅니다. 제품 라벨의 경고문구와 어린이 보호포장을 우선하세요."}</p>
        <p>${enc?.advice || "원액을 희석하고, 환기하고, 다른 세제와 섞지 말고, 아이 손 닿지 않는 곳에 두세요."}</p>
      </section>

      ${
        pc?.p?.IUPACName
          ? `<section class="section"><h2>IUPAC 이름</h2><p>${pc.p.IUPACName}</p></section>`
          : ""
      }

      <p class="source">출처: ${pc?.cid ? `PubChem CID ${pc.cid}` : "로컬 색인"} · ChEBI · 국제 GHS. 교육·참고용이며 진료를 대신하지 않습니다. 중독 의심 시 119 / 1399.</p>
    `;
    $("back-btn").onclick = () => {
      if (state.lastView === "browse") renderBrowse();
      else if (state.lastView === "results") renderResults();
      else show("home");
    };
  }

  function route() {
    const hash = location.hash.replace(/^#/, "");
    if (hash.startsWith("substance/")) {
      openDetail(hash.slice("substance/".length));
      return;
    }
    if (hash === "browse") {
      renderBrowse();
      return;
    }
    if (hash === "guide") {
      show("guide");
      return;
    }
    show("home");
  }

  document.addEventListener("click", (e) => {
    const cat = e.target.closest("[data-cat]");
    if (cat) {
      state.cat = cat.getAttribute("data-cat");
      state.page = 0;
      state.query = "";
      location.hash = "browse";
      renderBrowse();
      return;
    }
    const open = e.target.closest("[data-open]");
    if (open) {
      const key = open.getAttribute("data-open");
      location.hash = "substance/" + key;
      openDetail(key);
    }
  });

  $("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    state.query = $("q").value.trim();
    $("suggest").hidden = true;
    if (!state.query) return;
    const exact = findEncyclopediaByQuery(state.query);
    if (exact) {
      location.hash = "substance/" + encodeURIComponent(exact.cas || exact.name);
      openDetail(encodeURIComponent(exact.cas || exact.name));
      return;
    }
    renderResults();
  });

  $("q").addEventListener("input", () => suggest($("q").value));
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-box")) $("suggest").hidden = true;
  });

  $("cat-filter").addEventListener("change", () => {
    state.cat = $("cat-filter").value;
    state.page = 0;
    renderBrowse();
  });
  $("browse-q").addEventListener("input", () => {
    state.query = $("browse-q").value;
    state.page = 0;
    renderBrowse();
  });
  $("prev-page").addEventListener("click", () => {
    state.page = Math.max(0, state.page - 1);
    renderBrowse();
  });
  $("next-page").addEventListener("click", () => {
    state.page += 1;
    renderBrowse();
  });

  document.querySelectorAll("[data-route]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const r = a.getAttribute("data-route");
      if (r === "home") {
        state.query = "";
        state.cat = "전체";
        location.hash = "home";
        show("home");
      } else {
        location.hash = r;
        route();
      }
    });
  });

  fetch("data/catalog.json")
    .then((r) => r.json())
    .then((data) => {
      state.catalog = data.items || [];
      renderHome();
      route();
    })
    .catch(() => {
      state.catalog = (window.ENCYCLOPEDIA || []).map((e) => ({
        n: e.name,
        k: e.nameKo,
        c: e.cas,
        f: e.formula,
        g: e.category,
        a: e.aliases,
        d: e.summary,
        p: (e.products || []).join(", ")
      }));
      renderHome();
      route();
    });

  window.addEventListener("hashchange", route);
})();
