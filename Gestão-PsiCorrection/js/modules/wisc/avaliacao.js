/* ═══════════════════════════════════════════════════════
   WISC-IV — avaliacao.js
   Cálculo, renderização de resultados e exportação PDF
═══════════════════════════════════════════════════════ */

let wiscAvaliacaoAtiva = null;

// ── Subtotais e EI em tempo real ──
function atualizarSubtotalWISC(e) {
  const indice = e.target.dataset.indice;
  if (!indice) return;
  let soma = 0;
  document.querySelectorAll(`.wisc-score[data-indice="${indice}"]`).forEach(inp => {
    soma += parseInt(inp.value) || 0;
  });
  const somaEl = document.getElementById("wisc-soma-" + indice);
  const eiEl   = document.getElementById("wisc-ei-"   + indice);
  if (somaEl) somaEl.textContent = soma;
  if (eiEl)   eiEl.textContent   = soma > 0 ? calcularIndiceWISC(soma, indice) : "—";
}

// ── Limpar formulário WISC ──
function limparWISC() {
  ["wisc-nome", "wisc-obs"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const nascEl = document.getElementById("wisc-nasc");
  if (nascEl) nascEl.value = "";
  document.querySelectorAll(".wisc-score").forEach(inp => inp.value = "");
  ["cv","rp","mt","vp"].forEach(idx => {
    const somaEl = document.getElementById("wisc-soma-" + idx);
    const eiEl   = document.getElementById("wisc-ei-"   + idx);
    if (somaEl) somaEl.textContent = "0";
    if (eiEl)   eiEl.textContent   = "—";
  });
  const res = document.getElementById("wisc-resultado-inline");
  if (res) res.classList.add("hidden");
  wiscAvaliacaoAtiva = null;
}

// ── Calcular & Salvar WISC ──
async function calcularESalvarWISC() {
  const nome = document.getElementById("wisc-nome").value.trim();
  const nasc = document.getElementById("wisc-nasc").value;
  const sexo = document.getElementById("wisc-sexo").value;

  if (!nome || !nasc) {
    alert("Preencha o Nome e a Data de Nascimento do paciente.");
    return;
  }

  if (!await garantirNormas()) {
    alert("Normas indisponíveis. Verifique sua conexão e tente novamente.");
    return;
  }

  const idade = calcularIdade(nasc);
  if (idade < 6 || idade > 16) {
    alert("O WISC-IV é normatizado para crianças e adolescentes de 6 a 16 anos.");
    return;
  }

  // Coleta escores ponderados por índice
  const subtestes = {};
  const indices   = {};
  let somaTodos   = 0;

  for (const [idx, subs] of Object.entries(WISC_SUBTESTES_POR_INDICE)) {
    let soma = 0;
    subs.forEach(sub => {
      const inp = document.querySelector(`.wisc-score[data-indice="${idx}"][data-sub="${sub}"]`);
      const val = Math.min(Math.max(parseInt(inp?.value) || 0, 0), 19);
      subtestes[sub] = val;
      soma += val;
    });
    const score = calcularIndiceWISC(soma, idx);
    indices[idx] = { soma, score, classe: classificarQI(score) };
    somaTodos += soma;
  }

  // QI Total (FSIQ) — estimativa via soma dos 10 escores ponderados
  // (instrumento oficial usa tabelas de normatização por grupo de 4 meses — Pearson, 2013)
  const somaTotal = Object.values(subtestes).reduce((acc, v) => acc + v, 0);
  const tabelasWisc = getServidorNormas()?.wisc ?? WISC_NORMAS;
  const normaFsiq = tabelasWisc.fsiq;
  const fsiqScore = Math.max(40, Math.min(160, Math.round(100 + 15 * (somaTotal - normaFsiq.media) / normaFsiq.dp)));
  indices.fsiq = { score: fsiqScore, classe: classificarQI(fsiqScore), normalizacaoUsada: "estimada" };

  const avaliacao = {
    id: Date.now(),
    tipoTeste: "WISC-IV",
    data: new Date().toISOString(),
    profissional: usuarioLogado,
    paciente: { nome, nasc, sexo, idade },
    subtestes,
    indices,
    obs: document.getElementById("wisc-obs").value.trim()
  };

  salvarAvaliacao(avaliacao);
  wiscAvaliacaoAtiva = avaliacao;

  renderizarResultadoWISCInline(avaliacao);
  atualizarStats();
}

// ── Resultado inline WISC ──
function renderizarResultadoWISCInline(av) {
  const div = document.getElementById("wisc-resultado-conteudo");
  div.innerHTML = buildResultadoWISCHTML(av, "wisc-inline");
  const card = document.getElementById("wisc-resultado-inline");
  card.classList.remove("hidden");
  card.scrollIntoView({ behavior: "smooth", block: "start" });
  requestAnimationFrame(() => renderizarGraficosWISC(av, "wisc-inline"));
}

// ── HTML do resultado WISC ──
function buildResultadoWISCHTML(av, ctx) {
  const ordemIndices = ["cv", "rp", "mt", "vp"];
  let indicesHTML = "";

  for (const idx of ordemIndices) {
    const r = av.indices[idx];
    indicesHTML += `
      <div class="resultado-area">
        <div class="area-nome">${WISC_INDICES[idx]}</div>
        <div class="area-score">${r.score}<span class="area-max"> EI</span></div>
        <div style="font-size:11px;color:var(--text-muted);margin:2px 0">Soma ponderada: ${r.soma}</div>
        <div class="area-class"><span class="badge ${r.classe.badge}">${r.classe.label}</span></div>
      </div>`;
  }

  const fsiq   = av.indices.fsiq;
  const interp = gerarInterpretacaoWISC(av);

  const bannerNorma = `
    <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:#92400e">
      ⚠️ <strong>Normas estimadas:</strong> Os escores de índice (EI) e o QI Total (FSIQ) foram calculados por
      fórmula z simplificada. O instrumento oficial utiliza tabelas de normatização por grupos de idade de
      4 meses (Pearson, 2013). Os resultados são uma aproximação clínica — confirme com as tabelas do manual.
    </div>`;

  return `
    ${bannerNorma}
    <div style="margin-bottom:12px;font-size:13px;color:var(--text-muted)">
      <strong>${av.paciente.nome}</strong> &nbsp;|&nbsp;
      ${av.paciente.idade} anos &nbsp;|&nbsp;
      Avaliação em: ${formatarData(av.data)}
    </div>
    <div class="resultado-total">
      <div>
        <div class="total-label">QI Total (FSIQ)</div>
        <div class="total-score">${fsiq.score}</div>
      </div>
      <div class="total-class">${fsiq.classe.label}</div>
    </div>
    <div class="resultado-grid">${indicesHTML}</div>
    <div class="graficos-container">
      <div class="grafico-box"><p class="grafico-titulo">Perfil de Índices (Radar)</p><div class="grafico-wrap"><canvas id="chart-radar-${ctx}"></canvas></div></div>
      <div class="grafico-box"><p class="grafico-titulo">Escores por Índice</p><div class="grafico-wrap"><canvas id="chart-barras-${ctx}"></canvas></div></div>
    </div>
    <div class="resultado-interp-wrapper">
      <div class="resultado-interp-header">
        <strong>Interpretação Clínica</strong>
        <button type="button" class="btn-editar-interp" onclick="toggleEditarInterp(this)" title="Editar interpretação">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Editar
        </button>
      </div>
      <div class="resultado-interp" id="wisc-interp-texto" data-editavel="false">${interp}</div>
    </div>`;
}

// ── Gráficos WISC ──
function renderizarGraficosWISC(av, ctx) {
  const ordemIndices = ["cv", "rp", "mt", "vp"];
  const labels = ["Compr. Verbal", "Rac. Perceptual", "Mem. Operacional", "Vel. Processamento"];

  const corPorEI = ei => {
    if (ei >= 120) return { bg: "rgba(22,163,74,0.7)",   brd: "rgb(22,163,74)" };
    if (ei >= 110) return { bg: "rgba(5,150,105,0.7)",   brd: "rgb(5,150,105)" };
    if (ei >= 90)  return { bg: "rgba(124,58,237,0.7)",  brd: "rgb(124,58,237)" };
    if (ei >= 80)  return { bg: "rgba(217,119,6,0.7)",   brd: "rgb(217,119,6)" };
    return           { bg: "rgba(220,38,38,0.7)",    brd: "rgb(220,38,38)" };
  };

  const cores = ordemIndices.map(i => corPorEI(av.indices[i].score));

  if (_charts[`radar_${ctx}`])  _charts[`radar_${ctx}`].destroy();
  if (_charts[`barras_${ctx}`]) _charts[`barras_${ctx}`].destroy();

  // Radar — escores de índice (40–160, média=100)
  const canvasRadar = document.getElementById(`chart-radar-${ctx}`);
  if (canvasRadar) {
    _charts[`radar_${ctx}`] = new Chart(canvasRadar, {
      type: "radar",
      data: {
        labels,
        datasets: [
          {
            label: "Paciente (EI)",
            data: ordemIndices.map(i => av.indices[i].score),
            backgroundColor: "rgba(124,58,237,0.12)",
            borderColor: "rgba(124,58,237,0.9)",
            borderWidth: 2.5,
            pointBackgroundColor: cores.map(c => c.brd),
            pointRadius: 5,
            pointHoverRadius: 7
          },
          {
            label: "Média normativa (100)",
            data: ordemIndices.map(() => 100),
            borderColor: "rgba(148,163,184,0.6)",
            borderDash: [6, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          r: {
            min: 50, max: 150,
            ticks: { stepSize: 25, font: { size: 10 }, backdropColor: "transparent" },
            pointLabels: { font: { size: 11, weight: "600" } },
            grid: { color: "rgba(0,0,0,0.07)" },
            angleLines: { color: "rgba(0,0,0,0.07)" }
          }
        },
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 12 }, padding: 16 } },
          tooltip: { callbacks: { label: c => ` EI = ${c.raw}` } }
        }
      }
    });
  }

  // Barras — escores de índice
  const canvasBar = document.getElementById(`chart-barras-${ctx}`);
  if (canvasBar) {
    _charts[`barras_${ctx}`] = new Chart(canvasBar, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Paciente (EI)",
            data: ordemIndices.map(i => av.indices[i].score),
            backgroundColor: cores.map(c => c.bg),
            borderColor:     cores.map(c => c.brd),
            borderWidth: 1.5,
            borderRadius: 6
          },
          {
            label: "Média normativa (100)",
            data: ordemIndices.map(() => 100),
            backgroundColor: "rgba(148,163,184,0.2)",
            borderColor: "rgba(148,163,184,0.7)",
            borderWidth: 1.5,
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: {
            min: 50, max: 150,
            ticks: { font: { size: 11 } },
            grid: { color: "rgba(0,0,0,0.05)" }
          },
          x: { grid: { display: false }, ticks: { font: { size: 10 } } }
        },
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 12 }, padding: 16 } },
          tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.raw}` } }
        }
      }
    });
  }
}

// ── Interpretação WISC ──
function gerarInterpretacaoWISC(av) {
  const ordemIndices = ["cv", "rp", "mt", "vp"];
  const fsiq = av.indices.fsiq.score;
  const classe = av.indices.fsiq.classe;

  let txt = `A avaliação do funcionamento intelectual de <strong>${av.paciente.nome}</strong>, realizada por meio do WISC-IV, evidenciou um Quociente de Inteligência Total (FSIQ) de <strong>${fsiq}</strong>, situado na faixa <strong>${classe.label}</strong>, o que corresponde a ${classe.interp}.`;

  txt += `<br><br>`;

  const acima  = ordemIndices.filter(i => av.indices[i].score >= 110).map(i => WISC_INDICES[i]);
  const abaixo = ordemIndices.filter(i => av.indices[i].score < 90).map(i => WISC_INDICES[i]);

  if (acima.length && abaixo.length) {
    txt += `Na análise dos índices fatoriais, observou-se desempenho acima da média em <em>${acima.join(" e ")}</em>, configurando áreas de maior potencial cognitivo. Em contrapartida, os índices de <em>${abaixo.join(" e ")}</em> apresentaram escores abaixo do esperado para a faixa etária, o que merece atenção clínica e sugere a pertinência de investigação complementar dessas habilidades.`;
  } else if (acima.length) {
    txt += `Na análise dos índices fatoriais, destacaram-se positivamente <em>${acima.join(" e ")}</em>, com escores acima da média normativa, indicando recursos cognitivos bem desenvolvidos nessas áreas. Os demais índices situaram-se dentro dos parâmetros esperados.`;
  } else if (abaixo.length) {
    txt += `Na análise dos índices fatoriais, foram identificados escores abaixo da média em <em>${abaixo.join(" e ")}</em>, o que sugere a necessidade de acompanhamento e investigação mais aprofundada dessas competências. Os demais índices mantiveram-se dentro da faixa média.`;
  } else {
    txt += `Na análise dos índices fatoriais, todos os domínios cognitivos avaliados situaram-se dentro da faixa média esperada para a faixa etária, sem discrepâncias clinicamente significativas entre os índices.`;
  }

  txt += `<br><br>`;
  txt += `Os escores foram obtidos a partir das normas do WISC-IV para crianças de ${av.paciente.idade} anos. Recomenda-se que estes resultados sejam integrados aos dados clínicos, observacionais e de outros instrumentos para uma compreensão global do funcionamento cognitivo do avaliando.`;
  return txt;
}

// ── Exportar PDF WISC ──
function exportarPDFWISC(avParam) {
  const av = avParam || wiscAvaliacaoAtiva;
  if (!av) { alert("Nenhuma avaliação WISC para exportar."); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = 20, R = 190, W = R - L;
  let Y = 20;
  const cor   = [124, 58, 237];
  const cinza = [100, 116, 139];
  const preto = [30, 41, 59];
  const crpTxt = av.profissional.crp ? `CRP ${av.profissional.crp}` : "";

  // ── Cabeçalho ──────────────────────────────────────────────────────
  doc.setFillColor(...cor);
  doc.rect(0, 0, 210, 38, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text("LAUDO DE AVALIAÇÃO PSICOLÓGICA", L, 12);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.text("WISC-IV — Escala de Inteligência Wechsler para Crianças (4.ª Edição)", L, 19);
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
  doc.rect(L, Y, W, 22, "FD");

  doc.setTextColor(...cor);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text("I. IDENTIFICAÇÃO DO AVALIADO", L + 4, Y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...preto);
  doc.text(`Nome: ${av.paciente.nome}`, L + 4, Y + 13);
  doc.text(`Nascimento: ${formatarDataBR(av.paciente.nasc)}   |   Idade: ${av.paciente.idade} anos   |   Sexo: ${av.paciente.sexo === "M" ? "Masculino" : "Feminino"}`, L + 4, Y + 19);
  Y += 28;

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
  doc.text("Instrumento: WISC-IV — Escala de Inteligência Wechsler para Crianças, 4.ª Edição", L + 4, Y + 13);
  doc.text("Ref.: Ambiel, N.F., Santos, A.A.A. & Castro, N.R. de (2013). WISC-IV. Pearson. Faixa: 6;0–16;11 anos.", L + 4, Y + 19);
  doc.text(`Data de aplicação: ${formatarDataBR(av.data)}   |   Modalidade: individual e presencial`, L + 4, Y + 25);
  Y += 34;

  // ── III. ANÁLISE DOS RESULTADOS ─────────────────────────────────────
  doc.setTextColor(...preto);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("III. ANÁLISE DOS RESULTADOS", L, Y);
  Y += 5;

  const fsiq = av.indices.fsiq;
  doc.setFillColor(...cor);
  doc.rect(L, Y, W, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(`QI Total (FSIQ): ${fsiq.score}   —   ${fsiq.classe.label.toUpperCase()}`, L + 4, Y + 9);
  Y += 16;

  const cols = [L, L + 70, L + 105, L + 130, L + 155];
  const rowH = 8;
  doc.setFillColor(226, 232, 240);
  doc.rect(L, Y, W, rowH, "F");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...cinza);
  doc.text("ÍNDICE COGNITIVO", cols[0] + 2, Y + 5);
  doc.text("SOMA PONDERADA", cols[1] + 2, Y + 5);
  doc.text("ESCORE (EI)", cols[2] + 2, Y + 5);
  doc.text("PERCENTIL", cols[3] + 2, Y + 5);
  doc.text("CLASSIFICAÇÃO", cols[4] + 2, Y + 5);
  Y += rowH;

  const ordemIndices = ["cv", "rp", "mt", "vp"];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  ordemIndices.forEach((idx, i) => {
    const r = av.indices[idx];
    const corBadge = badgeParaCor(r.classe.badge);
    const percentil = Math.round(((r.score - 100) / 15) * 34 + 50);
    const pctClamp  = Math.max(1, Math.min(99, percentil));
    if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(L, Y, W, rowH, "F"); }
    doc.setTextColor(...preto);
    doc.text(WISC_INDICES[idx], cols[0] + 2, Y + 5);
    doc.text(`${r.soma}`, cols[1] + 2, Y + 5);
    doc.text(`${r.score}`, cols[2] + 2, Y + 5);
    doc.text(`~${pctClamp}º`, cols[3] + 2, Y + 5);
    doc.setFillColor(...corBadge.bg);
    doc.roundedRect(cols[4] + 2, Y + 1, 34, 5.5, 2, 2, "F");
    doc.setTextColor(...corBadge.txt);
    doc.setFont("helvetica", "bold");
    doc.text(r.classe.label, cols[4] + 19, Y + 5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...preto);
    doc.setDrawColor(226, 232, 240);
    doc.line(L, Y + rowH, R, Y + rowH);
    Y += rowH;
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
  const interpEl = document.getElementById("wisc-interp-texto");
  const interpTxt = interpEl ? interpEl.innerText : stripHTML(gerarInterpretacaoWISC(av));
  const linhas = doc.splitTextToSize(interpTxt, W);
  doc.text(linhas, L, Y);
  Y += linhas.length * 5 + 8;

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

  const nomeArq = `laudo_wisc_${av.paciente.nome.replace(/\s+/g,"_").toLowerCase()}_${formatarDataArq(av.data)}.pdf`;
  doc.save(nomeArq);
}
