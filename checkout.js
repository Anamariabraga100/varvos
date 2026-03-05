/**
 * Checkout VARVOS — Planos avulsos (Pix + Cartão) e mensais (Cartão)
 */
(function () {
  const AVULSOS = ['boas-vindas', 'starter', 'popular', 'pro-avulso', 'escala'];
  const MENSAIS = ['start', 'pro', 'agency'];

  function getPlan() {
    const params = new URLSearchParams(location.search);
    const plano = params.get('plano');
    if (!plano) return null;
    const plans = window.VARVOS_PLANS;
    return plans?.avulsos?.[plano] || plans?.mensais?.[plano] || null;
  }

  function getUserId() {
    try {
      const raw = localStorage.getItem('varvos_user');
      if (raw) {
        const u = JSON.parse(raw);
        return u.id || u.userId || null;
      }
    } catch {}
    return null;
  }

  function getUser() {
    try {
      const raw = localStorage.getItem('varvos_user');
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {}
    return null;
  }

  function showError(msg) {
    const el = document.getElementById('checkoutError');
    if (el) {
      el.textContent = msg;
      el.classList.remove('hidden');
    }
  }

  function hideError() {
    document.getElementById('checkoutError')?.classList.add('hidden');
  }

  function debugStep(label, content, isError) {
    const panel = document.getElementById('checkoutDebug');
    const steps = document.getElementById('checkoutDebugSteps');
    if (!panel || !steps) return;
    panel.classList.remove('hidden');
    const step = document.createElement('div');
    step.className = 'debug-step' + (isError ? ' error' : '');
    step.innerHTML = '<strong>' + label + '</strong>' +
      (content ? '<pre>' + (typeof content === 'string' ? content : JSON.stringify(content, null, 2)) + '</pre>' : '');
    steps.appendChild(step);
  }

  function clearDebug() {
    const steps = document.getElementById('checkoutDebugSteps');
    if (steps) steps.innerHTML = '';
  }

  function setLoading(btn, loading) {
    if (!btn) return;
    const txt = btn.querySelector('.btn-text');
    const ld = btn.querySelector('.btn-loading');
    if (loading) {
      btn.disabled = true;
      txt?.classList.add('hidden');
      ld?.classList.remove('hidden');
    } else {
      btn.disabled = false;
      txt?.classList.remove('hidden');
      ld?.classList.add('hidden');
    }
  }

  function getApiBase() {
    return window.location.origin + '/api';
  }

  // Sincroniza campo validade MM/AA para exp_date (MM-YYYY) para tokenizecard
  function syncExpDateToken(expInputId, tokenElId) {
    var expEl = document.getElementById(expInputId);
    var tokenEl = document.getElementById(tokenElId);
    if (!expEl || !tokenEl) return;
    var v = (expEl.value || '').replace(/\D/g, '');
    if (v.length >= 4) {
      var mm = v.slice(0, 2);
      var yy = v.slice(2, 4);
      tokenEl.value = mm + '-' + (parseInt(yy, 10) < 50 ? '20' + yy : '19' + yy);
    } else {
      tokenEl.value = (expEl.value || '').replace(/\//g, '-');
    }
  }

  function parseExp(expStr) {
    const m = String(expStr || '').replace(/\D/g, '');
    if (m.length >= 4) {
      return { month: m.slice(0, 2), year: m.slice(2, 4) };
    }
    return null;
  }

  // Tokenizecard.js — carrega script e inicializa PagarmeCheckout
  var useTokenizecard = !!(window.VARVOS_CONFIG && window.VARVOS_CONFIG.pagarMePublicKey);
  var cardSubmitTimeoutId = null;
  if (useTokenizecard) {
    var s = document.createElement('script');
    s.src = 'https://checkout.pagar.me/v1/tokenizecard.js';
    s.setAttribute('data-pagarmecheckout-app-id', window.VARVOS_CONFIG.pagarMePublicKey);
    s.onload = function () {
      if (window.PagarmeCheckout && window.PagarmeCheckout.init) {
        window.PagarmeCheckout.init(
          function success(data) {
            if (cardSubmitTimeoutId) { clearTimeout(cardSubmitTimeoutId); cardSubmitTimeoutId = null; }
            var token = data && (data.pagarmetoken || data.token || data.pagarmetoken_0 || data['pagarmetoken-0']);
            if (!token && data && typeof data === 'object') {
              for (var k in data) {
                if ((k === 'pagarmetoken' || k.indexOf('token') >= 0) && typeof data[k] === 'string' && data[k].length > 0 && data[k].length <= 50) {
                  token = data[k];
                  break;
                }
              }
            }
            if (!token) {
              var f = document.querySelector('form[data-pagarmecheckout-form]');
              var inp = f && (f.elements['pagarmetoken'] || f.querySelector('input[name=pagarmetoken]'));
              if (inp && inp.value) token = inp.value;
            }
            var avulsoVisible = !document.getElementById('checkoutAvulso')?.classList.contains('hidden');
            var planId = (data && data.planId) || (avulsoVisible ? document.getElementById('avulsoPlanId')?.value : document.getElementById('mensalPlanId')?.value);
            if (!planId && avulsoVisible) planId = new URLSearchParams(location.search).get('plano');
            var isAvulso = planId && AVULSOS.indexOf(planId) >= 0;
            var btn = isAvulso ? document.getElementById('btnAvulsoSubmit') : document.getElementById('btnMensalSubmit');
            if (!token) {
              debugStep('Tokenizecard retornou sem token', data, true);
              showError('Token do cartão não gerado. Tente novamente.');
              return false;
            }
            var merged = Object.assign({}, data || {});
            if (!merged.planId) merged.planId = planId;
            if (!merged.name && avulsoVisible) merged.name = document.getElementById('avulsoName')?.value;
            if (!merged.email && avulsoVisible) merged.email = document.getElementById('avulsoEmail')?.value;
            if (!merged.cpf && avulsoVisible) merged.cpf = document.getElementById('avulsoCpf')?.value;
            if (!merged.name && !avulsoVisible) merged.name = document.getElementById('mensalName')?.value;
            if (!merged.email && !avulsoVisible) merged.email = document.getElementById('mensalEmail')?.value;
            if (isAvulso) {
              doOrderFromToken(merged, token, btn);
            } else {
              doSubscriptionFromToken(merged, token, btn);
            }
            return false;
          },
          function fail(err) {
            if (cardSubmitTimeoutId) { clearTimeout(cardSubmitTimeoutId); cardSubmitTimeoutId = null; }
            showError(err && (err.message || err.error_message) || 'Erro ao processar cartão. Verifique os dados.');
            setLoading(document.getElementById('btnAvulsoSubmit'), false);
            setLoading(document.getElementById('btnMensalSubmit'), false);
          }
        );
      }
    };
    document.body.appendChild(s);
  }

  function doOrderFromToken(data, cardToken, btn) {
    var payload = {
      planId: data.planId,
      paymentMethod: 'credit_card',
      userId: getUserId(),
      customer: { name: data.name, email: data.email, document: (data.cpf || '').replace(/\D/g, '') || undefined },
      cardToken: cardToken,
    };
    debugStep('Passo 1: Dados enviados para a API', { url: getApiBase() + '/create-order', payload: { ...payload, cardToken: '(token)' } });
    fetch(getApiBase() + '/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.text().then(function (text) {
        debugStep('Passo 2: Resposta do servidor', { status: r.status, url: r.url, body: text });
        try { var d = JSON.parse(text); if (!r.ok) { debugStep('Passo 3: Erro da Pagar.me', d, true); throw new Error(d.error || d.message); } return d; }
        catch (e) { if (text.trim().startsWith('<')) throw new Error('A API não está respondendo. Use "npx vercel dev".'); throw e; }
      }); })
      .then(function (order) {
        var charge = order.charges?.[0];
        var tx = charge?.last_transaction || {};
        var gw = tx.gateway_response || {};
        var payFailed = order.status === 'failed' || charge?.status === 'failed';
        if (payFailed && gw?.errors?.length) {
          var errMsg = gw.errors.map(function (e) { return e.message; }).join('. ');
          showError(errMsg || 'Pagamento recusado. Verifique os dados do cartão.');
          debugStep('Passo 3: Erro da Pagar.me', gw.errors, true);
          return;
        }
        if (payFailed) {
          showError('Pagamento não aprovado. Tente outro cartão ou método.');
          return;
        }
        document.getElementById('checkoutSuccess')?.classList.remove('hidden');
        document.getElementById('checkoutAvulso')?.classList.add('hidden');
        document.getElementById('successMsg').textContent = 'Pagamento aprovado! Seus créditos foram adicionados à conta.';
      })
      .catch(function (err) { showError(err.message || 'Erro ao processar.'); })
      .finally(function () { if (cardSubmitTimeoutId) { clearTimeout(cardSubmitTimeoutId); cardSubmitTimeoutId = null; } setLoading(btn, false); });
  }

  function doSubscriptionFromToken(data, cardToken, btn) {
    var payload = { planId: data.planId, userId: getUserId(), customer: { name: data.name, email: data.email }, cardToken: cardToken };
    fetch(getApiBase() + '/create-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.text().then(function (text) {
        try {
          var d = JSON.parse(text);
          if (!r.ok) {
            var msg = d.error || d.message || 'Erro ao criar assinatura';
            if (d.details && typeof d.details === 'object') {
              var detailStr = Object.entries(d.details).map(function (e) { return e[0] + ': ' + (Array.isArray(e[1]) ? e[1].join(', ') : e[1]); }).join('\n');
              if (detailStr) msg = msg + '\n\n' + detailStr;
            }
            throw new Error(msg);
          }
          return d;
        } catch (e) {
          if (text.trim().startsWith('<')) throw new Error('A API não está respondendo.');
          throw e;
        }
      }); })
      .then(function () {
        document.getElementById('checkoutSuccess')?.classList.remove('hidden');
        document.getElementById('checkoutMensal')?.classList.add('hidden');
        document.getElementById('successMsg').textContent = 'Assinatura ativada! Seus créditos mensais foram creditados. A renovação é automática.';
      })
      .catch(function (err) { showError(err.message || 'Erro ao processar.'); })
      .finally(function () { if (cardSubmitTimeoutId) { clearTimeout(cardSubmitTimeoutId); cardSubmitTimeoutId = null; } setLoading(btn, false); });
  }

  // Inicialização — plano deve vir do modal; sem plano, redireciona
  const plan = getPlan();
  const user = getUser();

  if (!plan) {
    location.replace('/video/?planos=1');
    return;
  }
  if (AVULSOS.includes(plan.id)) {
    document.getElementById('checkoutAvulso')?.classList.remove('hidden');
    document.getElementById('avulsoPlanId').value = plan.id;
    document.getElementById('avulsoTitle').textContent = 'Comprar créditos — ' + plan.name;
    var creditsDisplay = (plan.credits * 10).toLocaleString('pt-BR');
    document.getElementById('avulsoPlan').textContent =
      creditsDisplay + ' créditos — R$ ' + (plan.amount / 100).toFixed(2).replace('.', ',') + ' (único)';
    var creditsNumEl = document.getElementById('avulsoPixCreditsNum');
    if (creditsNumEl) creditsNumEl.textContent = creditsDisplay;
    if (user?.email) document.getElementById('avulsoEmail').value = user.email;
    if (user?.name) document.getElementById('avulsoName').value = user.name;
    var btnT = document.getElementById('btnAvulsoSubmit')?.querySelector('.btn-text');
    if (btnT) btnT.textContent = 'Gerar QR Code Pix';
  } else {
    document.getElementById('checkoutMensal')?.classList.remove('hidden');
    document.getElementById('mensalPlanId').value = plan.id;
    document.getElementById('mensalTitle').textContent = 'Assinatura — ' + plan.name;
    var creditsDisplay = Number(plan.credits).toLocaleString('pt-BR');
    document.getElementById('mensalPlan').textContent =
      creditsDisplay + ' créditos/mês — R$ ' + (plan.amount / 100).toFixed(2).replace('.', ',') + '/mês';
    var creditsNumEl = document.getElementById('mensalCreditsNum');
    if (creditsNumEl) creditsNumEl.textContent = creditsDisplay;
    if (user?.email) document.getElementById('mensalEmail').value = user.email;
    if (user?.name) document.getElementById('mensalName').value = user.name;
  }

  // Tabs Pix / Cartão (avulsos) — formAvulso sempre tem data-pagarmecheckout-form para o tokenizecard vincular no init
  var formAvulsoEl = document.getElementById('formAvulso');
  document.querySelectorAll('.pm-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      const method = tab.dataset.method;
      document.querySelectorAll('.pm-tab').forEach(function (t) {
        t.classList.toggle('active', t.dataset.method === method);
      });
      const cardFields = document.getElementById('cardFieldsAvulso');
      const btn = document.getElementById('btnAvulsoSubmit');
      const btnTxt = btn?.querySelector('.btn-text');
      const trustCards = document.getElementById('avulsoTrustCards');
      var pixInstant = document.getElementById('avulsoPixInstant');
      var pixCreditsMsg = document.getElementById('avulsoPixCreditsMsg');
      if (method === 'pix') {
        cardFields?.classList.add('hidden');
        if (btnTxt) btnTxt.textContent = 'Gerar QR Code Pix';
        if (trustCards) trustCards.classList.add('hidden');
        if (pixInstant) pixInstant.classList.remove('hidden');
        if (pixCreditsMsg) pixCreditsMsg.classList.remove('hidden');
      } else {
        cardFields?.classList.remove('hidden');
        if (btnTxt) btnTxt.textContent = 'Pagar com cartão';
        if (trustCards) trustCards.classList.remove('hidden');
        if (pixInstant) pixInstant.classList.add('hidden');
        if (pixCreditsMsg) pixCreditsMsg.classList.add('hidden');
      }
      hideError();
    });
  });
  // Inicial: Pix selecionado — esconde bandeiras, mostra instantâneo
  document.getElementById('avulsoTrustCards')?.classList.add('hidden');

  // Submit avulso (Pix ou Cartão)
  document.getElementById('formAvulso')?.addEventListener('submit', function (e) {
    hideError();
    clearDebug();
    const planId = document.getElementById('avulsoPlanId').value;
    const name = document.getElementById('avulsoName').value.trim();
    const email = document.getElementById('avulsoEmail').value.trim();
    const activeTab = document.querySelector('.pm-tab.active');
    const paymentMethod = (activeTab?.dataset.method || 'pix');
    const cardFieldsEl = document.getElementById('cardFieldsAvulso');
    const cardFieldsHidden = cardFieldsEl?.classList.contains('hidden');
    const btnTxt = document.getElementById('btnAvulsoSubmit')?.querySelector('.btn-text')?.textContent || '';
    const isPix = cardFieldsHidden || paymentMethod === 'pix' || btnTxt.toLowerCase().includes('pix');
    const effectiveMethod = isPix ? 'pix' : 'credit_card';
    console.log('[Checkout] Submit:', { paymentMethod, effectiveMethod, isPix, cardFieldsHidden, btnText: btnTxt });
    debugStep('Início: método de pagamento', { tabAtivo: paymentMethod, cardFieldsOcultos: cardFieldsHidden, usando: effectiveMethod });

    const cpf = (document.getElementById('avulsoCpf')?.value || '').replace(/\D/g, '');
    if (cpf.length !== 11) {
      e.preventDefault();
      showError('Informe um CPF válido (11 dígitos).');
      return;
    }
    if (effectiveMethod === 'pix') {
      e.preventDefault();
      e.stopImmediatePropagation();
    }

    const payload = {
      planId,
      paymentMethod: effectiveMethod,
      userId: getUserId(),
      customer: { name, email, document: cpf || undefined },
    };

    const btn = document.getElementById('btnAvulsoSubmit');
    setLoading(btn, true);

    function doOrder(cardToken) {
      if (cardToken) payload.cardToken = cardToken;
      debugStep('Passo 1: Dados enviados para a API', { url: getApiBase() + '/create-order', payload: payload });

      fetch(getApiBase() + '/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          return r.text().then(function (text) {
            debugStep('Passo 2: Resposta do servidor', { status: r.status, url: r.url, body: text });
            try {
              var data = JSON.parse(text);
              if (!r.ok) {
                debugStep('Passo 3: Erro da Pagar.me', data, true);
                throw new Error(data.error || data.message || 'Erro ao criar pedido');
              }
              return data;
            } catch (e) {
              if (text.trim().startsWith('<')) {
                throw new Error('A API de pagamento não está respondendo. Use "npx vercel dev" (não "serve") para testar localmente.');
              }
              throw e;
            }
          });
        })
        .then(function (order) {
          if (effectiveMethod === 'pix') {
            const charge = order.charges?.[0];
            const lastTx = charge?.last_transaction;
            const gw = lastTx?.gateway_response || {};
            const orderFailed = order.status === 'failed' || charge?.status === 'failed';

            if (orderFailed && gw?.errors?.length) {
              const errMsg = gw.errors.map(function (e) { return e.message; }).join('. ');
              showError(errMsg);
              debugStep('Passo 3: Erro da Pagar.me', gw.errors);
              return;
            }

            const normalized = order._pix;
            const pixCode = normalized?.code || lastTx?.pix_qr_code || lastTx?.qr_code || lastTx?.pix_code || lastTx?.emv
              || (gw?.emv && gw.emv.length > 20 ? gw.emv : null) || (gw?.pix_copy_paste || null);
            const qrCode = normalized?.qr_url || lastTx?.qr_code_url || lastTx?.qr_code || lastTx?.pix_image
              || gw?.qr_code_url;

            document.getElementById('formAvulso')?.classList.add('hidden');
            document.querySelector('.payment-method-tabs')?.classList.add('hidden');
            const successDiv = document.getElementById('pixSuccess');
            successDiv?.classList.remove('hidden');

            var orderId = order.id;
            if (orderId) {
              var pollCount = 0;
              var maxPolls = 100;
              var pollInterval = setInterval(function () {
                pollCount++;
                if (pollCount > maxPolls) {
                  clearInterval(pollInterval);
                  return;
                }
                fetch(getApiBase() + '/order-status?orderId=' + encodeURIComponent(orderId))
                  .then(function (r) { return r.json(); })
                  .then(function (data) {
                    if (data.paid) {
                      clearInterval(pollInterval);
                      successDiv?.classList.add('hidden');
                      var successCard = document.getElementById('checkoutSuccess');
                      var successMsg = document.getElementById('successMsg');
                      if (successCard) successCard.classList.remove('hidden');
                      if (successMsg) successMsg.textContent = 'Pagamento confirmado! Seus créditos foram adicionados à conta.';
                      setTimeout(function () {
                        location.href = '/video/';
                      }, 2500);
                    }
                  })
                  .catch(function () {});
              }, 3000);
            }

            var planId = document.getElementById('avulsoPlanId')?.value;
            var plan = planId && (window.VARVOS_PLANS?.avulsos?.[planId] || window.VARVOS_PLANS?.mensais?.[planId]);
            var creditsMsg = document.getElementById('pixCreditsMsg');
            if (creditsMsg && plan) {
              var creditsDisplay = (plan.credits * 10).toLocaleString('pt-BR');
              creditsMsg.textContent = 'Após o pagamento você receberá seus ' + creditsDisplay + ' créditos automaticamente.';
              creditsMsg.classList.remove('hidden');
            } else if (creditsMsg) {
              creditsMsg.classList.add('hidden');
            }

            const codeToShow = pixCode || qrCode;
            const qrContainer = document.getElementById('pixQrContainer');
            if (qrContainer && codeToShow) {
              if (typeof qrCode === 'string' && qrCode.startsWith('http')) {
                const img = document.createElement('img');
                img.src = qrCode;
                img.alt = 'QR Code Pix';
                qrContainer.appendChild(img);
              } else {
                qrContainer.innerHTML = '<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(codeToShow) + '" alt="QR Code">';
              }
            }
            const codeInput = document.getElementById('pixCode');
            if (codeInput) {
              codeInput.value = codeToShow || '';
              if (!codeToShow) {
                codeInput.placeholder = 'Aguardando código... Verifique o app do seu banco.';
              }
            }
            document.getElementById('btnCopyPix')?.addEventListener('click', function () {
              codeInput?.select();
              navigator.clipboard?.writeText(codeInput?.value || '');
            });
          } else {
            document.getElementById('checkoutSuccess')?.classList.remove('hidden');
            document.getElementById('checkoutAvulso')?.classList.add('hidden');
            document.getElementById('successMsg').textContent =
              'Pagamento aprovado! Seus créditos foram adicionados à conta.';
          }
        })
        .catch(function (err) {
          showError(err.message || 'Erro ao processar. Tente novamente.');
        })
        .finally(function () {
          setLoading(btn, false);
        });
    }

    if (effectiveMethod === 'credit_card') {
      if (!useTokenizecard) {
        showError('Configure pagarMePublicKey no config.js para pagamento com cartão.');
        return;
      }
      if (!window.PagarmeCheckout || !window.PagarmeCheckout.init) {
        showError('Aguarde o carregamento do pagamento. Recarregue a página se persistir.');
        return;
      }
      var cardNum = document.getElementById('avulsoCardNumber').value.replace(/\D/g, '');
      var cardName = document.getElementById('avulsoCardName').value.trim();
      var exp = document.getElementById('avulsoCardExp').value;
      var parsed = parseExp(exp);
      if (!cardNum || !cardName || !parsed) {
        showError('Preencha todos os dados do cartão.');
        return;
      }
      syncExpDateToken('avulsoCardExp', 'avulsoExpDateToken');
      var cardNumEl = document.getElementById('avulsoCardNumber');
      if (cardNumEl) cardNumEl.value = cardNumEl.value.replace(/\D/g, '');
      setLoading(btn, true);
      if (cardSubmitTimeoutId) clearTimeout(cardSubmitTimeoutId);
      cardSubmitTimeoutId = setTimeout(function () {
        cardSubmitTimeoutId = null;
        setLoading(btn, false);
        showError('Tempo esgotado. Verifique se o domínio está cadastrado no Dashboard Pagar.me e tente novamente.');
      }, 25000);
    } else {
      doOrder();
      return;
    }
    e.preventDefault();
  });

  // Submit mensal (Cartão) — usa tokenizecard
  document.getElementById('formMensal')?.addEventListener('submit', function (e) {
    e.preventDefault();
    hideError();
    var planId = document.getElementById('mensalPlanId').value;
    var name = document.getElementById('mensalName').value.trim();
    var email = document.getElementById('mensalEmail').value.trim();
    var cardNum = document.getElementById('mensalCardNumber').value.replace(/\D/g, '');
    var cardName = document.getElementById('mensalCardName').value.trim();
    var exp = document.getElementById('mensalCardExp').value;
    var parsed = parseExp(exp);

    if (!name || !email || !cardNum || !cardName || !parsed) {
      showError('Preencha todos os campos.');
      return;
    }
    if (!useTokenizecard) {
      showError('Configure pagarMePublicKey no config.js para assinatura com cartão.');
      return;
    }
    if (!window.PagarmeCheckout || !window.PagarmeCheckout.init) {
      showError('Aguarde o carregamento do pagamento. Recarregue a página se persistir.');
      return;
    }
    syncExpDateToken('mensalCardExp', 'mensalExpDateToken');
    var cardNumEl = document.getElementById('mensalCardNumber');
    if (cardNumEl) cardNumEl.value = cardNumEl.value.replace(/\D/g, '');
    var btn = document.getElementById('btnMensalSubmit');
    setLoading(btn, true);
    if (cardSubmitTimeoutId) clearTimeout(cardSubmitTimeoutId);
    cardSubmitTimeoutId = setTimeout(function () {
      cardSubmitTimeoutId = null;
      setLoading(btn, false);
      showError('Tempo esgotado. Verifique se o domínio está cadastrado no Dashboard Pagar.me e tente novamente.');
    }, 25000);
  });

  // Formatar número do cartão
  function formatCardNumber(input) {
    input.addEventListener('input', function () {
      let v = this.value.replace(/\D/g, '');
      v = v.replace(/(\d{4})(?=\d)/g, '$1 ');
      this.value = v.substring(0, 19);
    });
  }
  ['avulsoCardNumber', 'mensalCardNumber'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) formatCardNumber(el);
  });

  // Formatar validade MM/AA e sincronizar com tokenizecard (exp_date)
  function formatExp(input, syncId) {
    input.addEventListener('input', function () {
      var v = this.value.replace(/\D/g, '');
      if (v.length >= 2) {
        v = v.substring(0, 2) + '/' + v.substring(2, 4);
      }
      this.value = v.substring(0, 5);
      if (syncId) {
        var tok = document.getElementById(syncId);
        if (tok) {
          var raw = this.value.replace(/\D/g, '');
          if (raw.length >= 4) {
            var mm = raw.slice(0, 2), yy = raw.slice(2, 4);
            tok.value = mm + '-' + (parseInt(yy, 10) < 50 ? '20' + yy : '19' + yy);
          } else {
            tok.value = this.value.replace(/\//g, '-');
          }
        }
      }
    });
  }
  var avulsoExp = document.getElementById('avulsoCardExp');
  if (avulsoExp) formatExp(avulsoExp, 'avulsoExpDateToken');
  var mensalExp = document.getElementById('mensalCardExp');
  if (mensalExp) formatExp(mensalExp, 'mensalExpDateToken');

  // Formatar CPF XXX.XXX.XXX-XX
  var cpfEl = document.getElementById('avulsoCpf');
  if (cpfEl) {
    cpfEl.addEventListener('input', function () {
      var v = this.value.replace(/\D/g, '').slice(0, 11);
      if (v.length > 9) {
        this.value = v.slice(0, 3) + '.' + v.slice(3, 6) + '.' + v.slice(6, 9) + '-' + v.slice(9);
      } else if (v.length > 6) {
        this.value = v.slice(0, 3) + '.' + v.slice(3, 6) + '.' + v.slice(6);
      } else if (v.length > 3) {
        this.value = v.slice(0, 3) + '.' + v.slice(3);
      } else {
        this.value = v;
      }
    });
  }
})();
