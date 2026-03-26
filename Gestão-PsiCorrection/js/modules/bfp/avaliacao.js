/* ═══════════════════════════════════════════════════════════════════
   BFP — Bateria Fatorial de Personalidade
   Aplicação, pontuação, exibição de resultados e laudo PDF
   Nunes, Hutz & Nunes (2010) — Casa do Psicólogo
═══════════════════════════════════════════════════════════════════ */

let bfpAvaliacaoAtiva = null;

// ──────────────────────────────────────────────────────
// INICIALIZAÇÃO DO FORMULÁRIO (gerado dinamicamente)
// ──────────────────────────────────────────────────────
function inicializarBFPForm() {
  const tabBar   = document.getElementById("bfp-tab-bar");
  const container = document.getElementById("bfp-tabs-container");
  if (!tabBar || !container) return;
  if (tabBar.children.length > 0) return; // já foi inicializado

  let tabsHTML    = "";
  let contentHTML = "";
  let isFirst     = true;

  Object.keys(BFP_FATORES).forEach(fCode => {
    const fator  = BFP_FATORES[fCode];
    const corHex = `rgb(${fator.cor.join(",")})`;

    tabsHTML += `<button class="bfp-tab${isFirst ? " active" : ""}" data-bfp-tab="${fCode}" style="${isFirst ? `border-bottom: 2px solid ${corHex};color:${corHex}` : ""}">${fator.nome} <span style="font-size:11px;opacity:.7">(${fCode})</span></button>`;

    let facetasHTML = `
      <div class="bfp-fator-desc">
        <span class="bfp-fator-badge" style="background:${corHex}">${fCode}</span>
        <span>${fator.desc}</span>
      </div>`;

    fator.facetas.forEach(faceCode => {
      const faceta  = BFP_FACETAS[faceCode];
      let itemsHTML = "";
      for (let i = 1; i <= 7; i++) {
        itemsHTML += `
          <div class="bfp-item">
            <div class="bfp-item-num">${i}</div>
            <input type="number" min="1" max="7"
              class="bfp-score"
              data-faceta="${faceCode}"
              placeholder="—"
              oninput="atualizarSubtotalBFP(this)">
          </div>`;
      }

      facetasHTML += `
        <div class="bfp-faceta-bloco">
          <div class="bfp-faceta-header">
            <div style="display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap">
              <span class="bfp-faceta-sigla" style="background:${corHex}">${faceCode}</span>
              <div>
                <span class="bfp-faceta-nome">${faceta.nome}</span>
                <span class="bfp-faceta-desc">${faceta.desc}</span>
              </div>
            </div>
            <div class="bfp-faceta-total">
              Total: <strong id="bfp-sub-${faceCode}">0</strong>/49
            </div>
          </div>
          <div class="bfp-items-row">${itemsHTML}</div>
        </div>`;
    });

    contentHTML += `<div class="bfp-tab-content${isFirst ? " active" : ""}" id="bfp-tab-${fCode}">${facetasHTML}</div>`;
    isFirst = false;
  });

  tabBar.innerHTML    = tabsHTML;
  container.innerHTML = contentHTML;

  // Delegação de eventos para tabs
  tabBar.addEventListener("click", e => {
    const btn = e.target.closest(".bfp-tab");
    if (!btn) return;
    const tabId  = btn.dataset.bfpTab;
    const fatorCor = `rgb(${BFP_FATORES[tabId].cor.join(",")})`;

    tabBar.querySelectorAll(".bfp-tab").forEach(t => {
      t.style.borderBottom = "";
      t.style.color        = "";
    });
    btn.style.borderBottom = `2px solid ${fatorCor}`;
    btn.style.color        = fatorCor;

    container.querySelectorAll(".bfp-tab-content").forEach(c => c.classList.remove("active"));
    const content = document.getElementById(`bfp-tab-${tabId}`);
    if (content) content.classList.add("active");
  });
}

// ──────────────────────────────────────────────────────
// SUBTOTAIS EM TEMPO REAL
// ──────────────────────────────────────────────────────
function atualizarSubtotalBFP(inp) {
  const faceta = inp.dataset.faceta;
  if (!faceta) return;
  let soma = 0;
  document.querySelectorAll(`.bfp-score[data-faceta="${faceta}"]`).forEach(i => {
    const v = parseInt(i.value);
    if (v >= 1 && v <= 7) soma += v;
  });
  const el = document.getElementById(`bfp-sub-${faceta}`);
  if (el) el.textContent = soma;
}

// ──────────────────────────────────────────────────────
// LIMPAR FORMULÁRIO
// ──────────────────────────────────────────────────────
function limparBFP() {
  ["bfp-nome","bfp-nasc","bfp-obs"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const sexoEl = document.getElementById("bfp-sexo");
  if (sexoEl) sexoEl.value = "M";
  const escEl = document.getElementById("bfp-esc");
  if (escEl) escEl.value = "";

  document.querySelectorAll(".bfp-score").forEach(inp => { inp.value = ""; });
  Object.keys(BFP_FACETAS).forEach(f => {
    const el = document.getElementById(`bfp-sub-${f}`);
    if (el) el.textContent = "0";
  });

  const resultado = document.getElementById("bfp-resultado-inline");
  if (resultado) resultado.classList.add("hidden");
  bfpAvaliacaoAtiva = null;
}

// ──────────────────────────────────────────────────────
// CALCULAR E SALVAR
// ──────────────────────────────────────────────────────
async function calcularBFP() {
  const nome = document.getElementById("bfp-nome").value.trim();
  const nasc = document.getElementById("bfp-nasc").value;
  const sexo = document.getElementById("bfp-sexo").value;
  const esc  = document.getElementById("bfp-esc").value;
  const obs  = document.getElementById("bfp-obs").value.trim();

  if (!nome || !nasc) {
    alert("Preencha o Nome Completo e a Data de Nascimento antes de calcular.");
    return;
  }

  if (!await garantirNormas()) {
    alert("Normas indisponíveis. Verifique sua conexão e tente novamente.");
    return;
  }

  const idade = calcularIdade(nasc);
  if (idade < 17) {
    alert("O BFP é aplicável a partir dos 17 anos de idade.");
    return;
  }

  // Verificar itens incompletos
  const inputs = document.querySelectorAll(".bfp-score");
  let faltando = 0;
  inputs.forEach(inp => {
    const v = parseInt(inp.value);
    if (!v || v < 1 || v > 7) faltando++;
  });
  if (faltando > 0) {
    if (!confirm(`${faltando} item(ns) não preenchido(s). Itens vazios serão contabilizados como 1 (Nunca). Deseja continuar?`)) return;
  }

  // Coletar e calcular scores por faceta
  const facetaScores = {};
  Object.keys(BFP_FACETAS).forEach(fCode => {
    let soma = 0;
    document.querySelectorAll(`.bfp-score[data-faceta="${fCode}"]`).forEach(inp => {
      const v = parseInt(inp.value);
      soma += (v >= 1 && v <= 7) ? v : 1;
    });
    const ts = bfpTScore(soma, fCode);
    facetaScores[fCode] = {
      raw:    soma,
      max:    49,
      tscore: ts,
      percen: bfpPercentil(ts),
      classe: bfpClassificar(ts)
    };
  });

  // Calcular scores por fator (média de T-scores das facetas)
  const fatorScores = {};
  Object.keys(BFP_FATORES).forEach(fCode => {
    const fator  = BFP_FATORES[fCode];
    const raw    = fator.facetas.reduce((acc, f) => acc + facetaScores[f].raw, 0);
    const maxRaw = fator.facetas.length * 49;
    const tMedio = Math.round(
      fator.facetas.reduce((acc, f) => acc + facetaScores[f].tscore, 0) / fator.facetas.length
    );
    fatorScores[fCode] = {
      raw,
      max:    maxRaw,
      tscore: tMedio,
      percen: bfpPercentil(tMedio),
      classe: bfpClassificar(tMedio)
    };
  });

  const avaliacao = {
    id:          Date.now(),
    tipoTeste:   "BFP",
    data:        new Date().toISOString(),
    profissional: usuarioLogado,
    paciente:    { nome, nasc, sexo, esc, idade },
    facetaScores,
    fatorScores,
    obs
  };

  salvarAvaliacao(avaliacao);
  bfpAvaliacaoAtiva = avaliacao;
  renderizarResultadoBFP(avaliacao);
  atualizarStats();
}

// ──────────────────────────────────────────────────────
// RENDERIZAÇÃO INLINE DO RESULTADO
// ──────────────────────────────────────────────────────
function renderizarResultadoBFP(av) {
  const div  = document.getElementById("bfp-resultado-conteudo");
  div.innerHTML = buildResultadoBFPHTML(av, "bfp-inline");
  const card = document.getElementById("bfp-resultado-inline");
  card.classList.remove("hidden");
  card.scrollIntoView({ behavior: "smooth", block: "start" });
  requestAnimationFrame(() => renderizarGraficosBFP(av, "bfp-inline"));
}

function buildResultadoBFPHTML(av, ctx) {
  const escMap = {
    baixa: "Baixa (0–4 anos)", media: "Média (5–11 anos)", alta: "Alta (12+ anos)"
  };

  // Cards de fatores
  let fatoresHTML = "";
  Object.keys(BFP_FATORES).forEach(fCode => {
    const fator = BFP_FATORES[fCode];
    const score = av.fatorScores[fCode];
    const pct   = Math.round((score.raw / score.max) * 100);
    const corHex = `rgb(${fator.cor.join(",")})`;
    fatoresHTML += `
      <div class="resultado-area">
        <div class="area-nome" style="color:${corHex}">${fator.sigla}</div>
        <div class="area-score" style="font-size:18px">${score.tscore}<span class="area-max" style="font-size:12px"> T</span></div>
        <div style="font-size:10px;color:var(--text-muted);margin:2px 0">P≈${score.percen}º &nbsp;|&nbsp; ${pct}%</div>
        <div class="area-class">
          <span class="badge" style="background:${corHex}18;color:${corHex};font-size:11px">${score.classe.label}</span>
        </div>
      </div>`;
  });

  // Tabela de facetas
  let facetasRows = "";
  Object.keys(BFP_FACETAS).forEach(fCode => {
    const faceta  = BFP_FACETAS[fCode];
    const score   = av.facetaScores[fCode];
    const fatorCfg = BFP_FATORES[faceta.fator];
    const corHex  = `rgb(${fatorCfg.cor.join(",")})`;
    const pct     = Math.round((score.raw / score.max) * 100);
    facetasRows += `
      <tr>
        <td>
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${corHex};margin-right:5px;vertical-align:middle"></span>
          ${faceta.nome}
        </td>
        <td style="text-align:center;color:var(--text-muted)"><strong>${faceta.fator}</strong></td>
        <td style="text-align:center">${score.raw}/49</td>
        <td style="text-align:center">${score.tscore}</td>
        <td style="text-align:center">≈${score.percen}º</td>
        <td>
          <div style="background:#e5e7eb;border-radius:3px;height:6px;width:70px;display:inline-block;vertical-align:middle">
            <div style="background:${corHex};height:6px;border-radius:3px;width:${pct}%"></div>
          </div>
        </td>
        <td>
          <span class="badge" style="background:${corHex}18;color:${corHex};font-size:10px;padding:2px 7px">
            ${score.classe.label}
          </span>
        </td>
      </tr>`;
  });

  return `
    <div style="margin-bottom:12px;font-size:13px;color:var(--text-muted)">
      <strong>${av.paciente.nome}</strong> &nbsp;|&nbsp;
      ${av.paciente.idade} anos &nbsp;|&nbsp;
      Sexo: ${av.paciente.sexo === "M" ? "Masculino" : "Feminino"}
      ${av.paciente.esc ? ` &nbsp;|&nbsp; Escolaridade: ${escMap[av.paciente.esc] || av.paciente.esc}` : ""}
      &nbsp;|&nbsp; Aplicação em: ${formatarData(av.data)}
    </div>

    <div class="resultado-grid">${fatoresHTML}</div>

    <div class="graficos-container">
      <canvas id="bfp-chart-radar-${ctx}"></canvas>
      <canvas id="bfp-chart-barras-${ctx}"></canvas>
    </div>

    <div style="margin:18px 0 8px;font-weight:600;font-size:14px;color:var(--text)">Detalhamento por Faceta</div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:520px">
        <thead>
          <tr style="background:var(--surface);font-size:11px;color:var(--text-muted)">
            <th style="text-align:left;padding:6px 8px">Faceta</th>
            <th style="padding:6px 4px;text-align:center">Fator</th>
            <th style="padding:6px 4px;text-align:center">Bruto</th>
            <th style="padding:6px 4px;text-align:center">T-score</th>
            <th style="padding:6px 4px;text-align:center">Percentil</th>
            <th style="padding:6px 8px;text-align:center">Perfil</th>
            <th style="padding:6px 8px">Classificação</th>
          </tr>
        </thead>
        <tbody>${facetasRows}</tbody>
      </table>
    </div>

    <div class="resultado-interp-wrapper" style="margin-top:18px">
      <div class="resultado-interp-header">
        <strong>Interpretação Clínica</strong>
        <button type="button" class="btn-editar-interp" onclick="toggleEditarInterp(this)" title="Editar interpretação">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Editar
        </button>
      </div>
      <div class="resultado-interp" id="bfp-interp-texto" data-editavel="false">${gerarInterpretacaoBFP(av)}</div>
    </div>
    <p style="font-size:11px;color:var(--text-muted);margin-top:8px;font-style:italic">
      * Os T-scores são calculados com base em normas aproximadas para adultos brasileiros.
      Consulte o manual BFP (Nunes, Hutz &amp; Nunes, 2010) para interpretação normativa precisa.
    </p>`;
}

// ──────────────────────────────────────────────────────
// INTERPRETAÇÃO TEXTUAL
// ──────────────────────────────────────────────────────
function gerarInterpretacaoBFP(av) {
  const N  = av.fatorScores.N;
  const E  = av.fatorScores.E;
  const S  = av.fatorScores.S;
  const R  = av.fatorScores.R;
  const A  = av.fatorScores.A;

  const descFator = (fCode, score) => {
    const f     = BFP_FATORES[fCode];
    const label = score.classe.label.toLowerCase();
    if (fCode === "N") {
      if (score.tscore >= 60) return `No fator <em>Neuroticismo</em>, o escore T de ${score.tscore} situa-se em nível elevado, sugerindo maior vulnerabilidade emocional e propensão a vivenciar afetos negativos com mais frequência e intensidade`;
      if (score.tscore >= 45) return `No fator <em>Neuroticismo</em>, o escore T de ${score.tscore} indica um nível ${label}, compatível com relativa estabilidade emocional e capacidade adequada de manejo do estresse`;
      return `No fator <em>Neuroticismo</em>, o escore T de ${score.tscore} aponta para um nível baixo, sugerindo boa estabilidade emocional e resiliência diante de situações adversas`;
    }
    if (fCode === "E") {
      if (score.tscore >= 60) return `Em <em>${f.nome}</em>, o nível ${label} (T=${score.tscore}) indica uma pessoa sociável, comunicativa e que tende a buscar estímulo no contato interpessoal`;
      if (score.tscore <= 40) return `Em <em>${f.nome}</em>, o nível ${label} (T=${score.tscore}) sugere preferência por atividades mais reservadas e menor necessidade de estímulo social`;
      return `Em <em>${f.nome}</em>, o resultado situou-se no nível ${label} (T=${score.tscore}), dentro dos parâmetros esperados`;
    }
    if (fCode === "S") {
      if (score.tscore >= 60) return `Em <em>${f.nome}</em>, o nível ${label} (T=${score.tscore}) revela tendência a comportamentos pró-sociais, empatia e consideração pelo outro`;
      if (score.tscore <= 40) return `Em <em>${f.nome}</em>, o nível ${label} (T=${score.tscore}) pode indicar menor disponibilidade para relações cooperativas ou postura mais assertiva e competitiva`;
      return `Em <em>${f.nome}</em>, o resultado situou-se no nível ${label} (T=${score.tscore}), dentro da faixa normativa`;
    }
    if (fCode === "R") {
      if (score.tscore >= 60) return `Em <em>${f.nome}</em>, o nível ${label} (T=${score.tscore}) indica boa capacidade de organização, planejamento e comprometimento com metas e responsabilidades`;
      if (score.tscore <= 40) return `Em <em>${f.nome}</em>, o nível ${label} (T=${score.tscore}) pode sinalizar menor grau de autodisciplina e organização, sendo relevante avaliar o impacto funcional`;
      return `Em <em>${f.nome}</em>, o resultado situou-se no nível ${label} (T=${score.tscore}), compatível com a média normativa`;
    }
    // Abertura
    if (score.tscore >= 60) return `Em <em>${f.nome}</em>, o nível ${label} (T=${score.tscore}) sugere interesse por novas experiências, criatividade e abertura a perspectivas diversas`;
    if (score.tscore <= 40) return `Em <em>${f.nome}</em>, o nível ${label} (T=${score.tscore}) aponta para preferência por rotinas estabelecidas e menor busca por novidade`;
    return `Em <em>${f.nome}</em>, o resultado situou-se no nível ${label} (T=${score.tscore}), dentro dos parâmetros normativos`;
  };

  let txt = `A avaliação dos traços de personalidade de <strong>${av.paciente.nome}</strong>, conduzida por meio da Bateria Fatorial de Personalidade (BFP), revelou o seguinte perfil nas cinco dimensões do modelo Big Five:`;
  txt += `<br><br>`;
  txt += [descFator("N", N), descFator("E", E), descFator("S", S), descFator("R", R), descFator("A", A)].join(". ") + ".";
  txt += `<br><br>`;
  txt += `Ressalta-se que os resultados do BFP oferecem um panorama dos traços de personalidade e devem ser interpretados de forma integrada, à luz do contexto clínico, da história pessoal e das demandas específicas apresentadas pelo avaliando. Nenhum fator isolado é suficiente para uma conclusão diagnóstica.`;
  return txt;
}

// ──────────────────────────────────────────────────────
// GRÁFICOS (Chart.js)
// ──────────────────────────────────────────────────────
function renderizarGraficosBFP(av, ctx) {
  const fatores  = ["N", "E", "S", "R", "A"];
  const labels   = ["Neuroticismo", "Extroversão", "Socialização", "Realização", "Abertura"];
  const tscores  = fatores.map(f => av.fatorScores[f].tscore);
  const cores    = fatores.map(f => `rgba(${BFP_FATORES[f].cor.join(",")},0.65)`);
  const bordas   = fatores.map(f => `rgb(${BFP_FATORES[f].cor.join(",")})`);

  if (_charts[`bfp_radar_${ctx}`])  _charts[`bfp_radar_${ctx}`].destroy();
  if (_charts[`bfp_barras_${ctx}`]) _charts[`bfp_barras_${ctx}`].destroy();

  // Radar
  const canvasRadar = document.getElementById(`bfp-chart-radar-${ctx}`);
  if (canvasRadar) {
    _charts[`bfp_radar_${ctx}`] = new Chart(canvasRadar, {
      type: "radar",
      data: {
        labels,
        datasets: [
          {
            label: "T-score (paciente)",
            data: tscores,
            backgroundColor: "rgba(99,102,241,0.10)",
            borderColor: "rgba(99,102,241,0.9)",
            borderWidth: 2.5,
            pointBackgroundColor: bordas,
            pointRadius: 5,
            pointHoverRadius: 7
          },
          {
            label: "Média normativa (T=50)",
            data: fatores.map(() => 50),
            borderColor: "rgba(148,163,184,0.5)",
            borderDash: [6, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        scales: {
          r: {
            min: 20, max: 80,
            ticks: { stepSize: 10, backdropColor: "transparent", font: { size: 10 } },
            pointLabels: { font: { size: 11, weight: "600" } },
            grid: { color: "rgba(0,0,0,0.07)" }
          }
        },
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 12 }, padding: 16 } },
          tooltip: { callbacks: { label: c => ` T = ${c.raw}` } }
        }
      }
    });
  }

  // Barras
  const canvasBar = document.getElementById(`bfp-chart-barras-${ctx}`);
  if (canvasBar) {
    _charts[`bfp_barras_${ctx}`] = new Chart(canvasBar, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "T-score (paciente)",
            data: tscores,
            backgroundColor: cores,
            borderColor: bordas,
            borderWidth: 1.5,
            borderRadius: 6
          },
          {
            label: "Média normativa (T=50)",
            data: fatores.map(() => 50),
            backgroundColor: "rgba(148,163,184,0.2)",
            borderColor: "rgba(148,163,184,0.7)",
            borderWidth: 1.5,
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        scales: {
          y: {
            min: 20, max: 80,
            ticks: { stepSize: 10, font: { size: 11 } },
            grid: { color: "rgba(0,0,0,0.05)" }
          },
          x: { grid: { display: false }, ticks: { font: { size: 11 } } }
        },
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 12 }, padding: 16 } },
          tooltip: { callbacks: { label: c => ` T = ${c.raw}` } }
        }
      }
    });
  }
}

// ──────────────────────────────────────────────────────
// EXPORTAR PDF — Resolução CFP nº 06/2019
// ──────────────────────────────────────────────────────
function exportarPDFBFP(avParam) {
  const av = avParam || bfpAvaliacaoAtiva;
  if (!av) { alert("Nenhuma avaliação BFP para exportar."); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = 20, R = 190, W = R - L;
  let Y = 20;
  const cor   = [99, 102, 241];
  const cinza = [100, 116, 139];
  const preto = [30, 41, 59];
  const crpTxt = av.profissional.crp ? `CRP ${av.profissional.crp}` : "";
  const escMap = {
    baixa: "Baixa (0–4 anos de escolaridade)",
    media: "Média (5–11 anos de escolaridade)",
    alta:  "Alta (12 ou mais anos de escolaridade)"
  };

  // ── Cabeçalho ──────────────────────────────────────────────────────
  doc.setFillColor(...cor);
  doc.rect(0, 0, 210, 38, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text("LAUDO DE AVALIAÇÃO PSICOLÓGICA", L, 12);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text("BFP — Bateria Fatorial de Personalidade (Nunes, Hutz & Nunes, 2010)", L, 19);
  doc.text("Elaborado em conformidade com a Resolução CFP nº 06/2019", L, 25);
  doc.setFontSize(8);
  doc.text(av.profissional.nome, R, 14, { align: "right" });
  doc.text(crpTxt, R, 19, { align: "right" });
  doc.text(`Emissão: ${formatarData(new Date().toISOString())}`, R, 24, { align: "right" });

  Y = 46;

  // ── I. IDENTIFICAÇÃO DO AVALIADO ───────────────────────────────────
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...cor);
  doc.setLineWidth(0.3);
  doc.rect(L, Y, W, 28, "FD");
  doc.setTextColor(...cor);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text("I. IDENTIFICAÇÃO DO AVALIADO", L + 4, Y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...preto);
  doc.text(`Nome: ${av.paciente.nome}`, L + 4, Y + 13);
  doc.text(`Nascimento: ${formatarDataBR(av.paciente.nasc)}   |   Idade: ${av.paciente.idade} anos   |   Sexo: ${av.paciente.sexo === "M" ? "Masculino" : "Feminino"}`, L + 4, Y + 19);
  doc.text(`Escolaridade: ${escMap[av.paciente.esc] || "Não informada"}`, L + 4, Y + 25);
  Y += 34;

  // ── II. PROCEDIMENTO ADOTADO ────────────────────────────────────────
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...cor);
  doc.rect(L, Y, W, 28, "FD");
  doc.setTextColor(...cor);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text("II. PROCEDIMENTO ADOTADO", L + 4, Y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...preto);
  doc.text("Instrumento: BFP — Bateria Fatorial de Personalidade", L + 4, Y + 13);
  doc.text("Referência: Nunes, Hutz & Nunes (2010). Casa do Psicólogo. Normas para adultos brasileiros.", L + 4, Y + 19);
  doc.text(`Data de aplicação: ${formatarDataBR(av.data)}   |   Modalidade: individual`, L + 4, Y + 25);
  Y += 34;

  // ── III. ANÁLISE DOS RESULTADOS — FATORES ──────────────────────────
  doc.setTextColor(...preto);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("III. ANÁLISE DOS RESULTADOS — FATORES DE PERSONALIDADE", L, Y);
  Y += 7;

  const fatores = ["N", "E", "S", "R", "A"];
  const rowH    = 8;
  const cols    = [L, L + 55, L + 100, L + 120, L + 142, L + 163];

  doc.setFillColor(226, 232, 240);
  doc.rect(L, Y, W, rowH, "F");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...cinza);
  doc.text("FATOR", cols[0] + 2, Y + 5);
  doc.text("ESCORE BRUTO", cols[1] + 2, Y + 5);
  doc.text("T-SCORE", cols[2] + 2, Y + 5);
  doc.text("PERCENTIL", cols[3] + 2, Y + 5);
  doc.text("ESTABILIDADE", cols[4] + 2, Y + 5);
  doc.text("CLASSIFICAÇÃO", cols[5] + 2, Y + 5);
  Y += rowH;

  fatores.forEach((fCode, i) => {
    const fator   = BFP_FATORES[fCode];
    const score   = av.fatorScores[fCode];
    const corBadge = bfpBadgeCor(score.classe.badge);
    const pctApx  = bfpPercentil(score.tscore);
    const fatorCorRgb = fator.cor;

    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(L, Y, W, rowH, "F"); }
    doc.setTextColor(...preto);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setFillColor(...fatorCorRgb);
    doc.roundedRect(cols[0] + 2, Y + 1, 20, 5.5, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.text(fator.nome, cols[0] + 12, Y + 5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...preto);
    doc.text(`${score.raw} / ${score.max}`, cols[1] + 2, Y + 5);
    doc.text(`${score.tscore}`, cols[2] + 2, Y + 5);
    doc.text(`~${pctApx}º`, cols[3] + 2, Y + 5);

    // Barra de perfil
    const pct = Math.round((score.raw / score.max) * 100);
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(cols[4] + 2, Y + 2.5, 16, 3, 1.5, 1.5, "F");
    doc.setFillColor(...fatorCorRgb);
    doc.roundedRect(cols[4] + 2, Y + 2.5, Math.max(1, pct * 0.16), 3, 1.5, 1.5, "F");

    doc.setFillColor(...corBadge.bg);
    doc.roundedRect(cols[5] + 1, Y + 1, 26, 5.5, 2, 2, "F");
    doc.setTextColor(...corBadge.txt);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(score.classe.label, cols[5] + 14, Y + 5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...preto);
    doc.setDrawColor(226, 232, 240);
    doc.line(L, Y + rowH, R, Y + rowH);
    Y += rowH;
  });

  Y += 8;

  // ── Tabela de facetas ───────────────────────────────────────────────
  if (Y > 215) { doc.addPage(); Y = 20; }
  doc.setTextColor(...preto);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("DETALHAMENTO POR FACETA", L, Y);
  Y += 6;

  const fcols = [L, L + 52, L + 68, L + 90, L + 110, L + 130];
  doc.setFillColor(226, 232, 240);
  doc.rect(L, Y, W, 7, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...cinza);
  doc.text("FACETA", fcols[0] + 2, Y + 4.5);
  doc.text("FATOR", fcols[1] + 2, Y + 4.5);
  doc.text("BRUTO", fcols[2] + 2, Y + 4.5);
  doc.text("T-SCORE", fcols[3] + 2, Y + 4.5);
  doc.text("PERCENTIL", fcols[4] + 2, Y + 4.5);
  doc.text("CLASSIFICAÇÃO", fcols[5] + 2, Y + 4.5);
  Y += 7;

  let rowIdx = 0;
  Object.keys(BFP_FACETAS).forEach(fCode => {
    if (Y > 270) { doc.addPage(); Y = 20; }
    const faceta    = BFP_FACETAS[fCode];
    const score     = av.facetaScores[fCode];
    const corBadge  = bfpBadgeCor(score.classe.badge);
    const fatorCor  = BFP_FATORES[faceta.fator].cor;

    if (rowIdx % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(L, Y, W, 6.5, "F"); }
    doc.setTextColor(...preto);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setFillColor(...fatorCor);
    doc.circle(fcols[0] + 3, Y + 3.2, 1.5, "F");
    doc.setTextColor(...preto);
    doc.text(faceta.nome, fcols[0] + 6, Y + 4.5);
    doc.setFillColor(...fatorCor);
    doc.roundedRect(fcols[1] + 1, Y + 0.8, 12, 5, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(faceta.fator, fcols[1] + 7, Y + 4.5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...preto);
    doc.text(`${score.raw}`, fcols[2] + 2, Y + 4.5);
    doc.text(`${score.tscore}`, fcols[3] + 2, Y + 4.5);
    doc.text(`~${score.percen}º`, fcols[4] + 2, Y + 4.5);
    doc.setFillColor(...corBadge.bg);
    doc.roundedRect(fcols[5] + 1, Y + 0.8, 26, 5, 2, 2, "F");
    doc.setTextColor(...corBadge.txt);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(score.classe.label, fcols[5] + 14, Y + 4.5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...preto);
    doc.setDrawColor(226, 232, 240);
    doc.line(L, Y + 6.5, R, Y + 6.5);
    Y += 6.5;
    rowIdx++;
  });

  Y += 10;

  // ── IV. CONCLUSÃO ───────────────────────────────────────────────────
  if (Y > 220) { doc.addPage(); Y = 20; }
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...preto);
  doc.text("IV. CONCLUSÃO", L, Y);
  Y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(50, 50, 50);
  const interpEl = document.getElementById("bfp-interp-texto");
  const interpTxt = interpEl ? interpEl.innerText : gerarInterpretacaoBFP(av).replace(/<[^>]+>/g, "");
  const linhas    = doc.splitTextToSize(interpTxt, W);
  doc.text(linhas, L, Y);
  Y += linhas.length * 5 + 6;

  const notaLinhas = doc.splitTextToSize(
    "Nota: Os T-scores foram calculados com base em normas aproximadas para adultos brasileiros. Consulte o manual BFP (Nunes, Hutz & Nunes, 2010) para interpretação normativa completa, estratificada por sexo e faixa etária.", W);
  doc.setFontSize(7.5);
  doc.setTextColor(...cinza);
  doc.text(notaLinhas, L, Y);
  Y += notaLinhas.length * 4.5 + 6;

  // ── V. OBSERVAÇÕES CLÍNICAS ─────────────────────────────────────────
  if (av.obs) {
    if (Y > 235) { doc.addPage(); Y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...preto);
    doc.text("V. OBSERVAÇÕES CLÍNICAS", L, Y);
    Y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(50, 50, 50);
    const obsLinhas = doc.splitTextToSize(av.obs, W);
    doc.text(obsLinhas, L, Y);
    Y += obsLinhas.length * 5 + 8;
  }

  // ── Assinatura ──────────────────────────────────────────────────────
  if (Y > 248) { doc.addPage(); Y = 20; }
  Y = Math.max(Y, 248);
  doc.setDrawColor(...cinza);
  doc.setLineWidth(0.3);
  doc.line(L, Y, L + 90, Y);
  doc.setFontSize(8.5);
  doc.setTextColor(...preto);
  doc.setFont("helvetica", "bold");
  doc.text(av.profissional.nome, L, Y + 5);
  doc.setFont("helvetica", "normal");
  doc.text(crpTxt, L, Y + 10);
  doc.setTextColor(...cinza);
  doc.text(`Local e data: _________________________________, ${formatarData(new Date().toISOString())}`, R, Y + 5, { align: "right" });
  doc.setFontSize(6.5);
  doc.setTextColor(120, 120, 120);
  doc.text("Nota técnica: resultados calculados com as normas carregadas do servidor no momento da avaliação.", 105, 286, { align: "center" });
  doc.setFontSize(7);
  doc.text("Elaborado em conformidade com a Resolução CFP nº 06/2019. Uso exclusivo do profissional responsável.", 105, 292, { align: "center" });

  const nomeArq = `BFP_${av.paciente.nome.replace(/\s+/g, "_")}_${formatarDataArq(av.data)}.pdf`;
  doc.save(nomeArq);
}
