/**
 * Checkout VARVOS — Planos avulsos (Pix + Cartão) e mensais (Cartão)
 */
(function () {
  const AVULSOS = ['starter', 'popular', 'pro-avulso', 'escala'];
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

  // Tokenizar cartão com Pagar.me (encryption key)
  function tokenizeCard(cardData) {
    const encKey = window.VARVOS_CONFIG?.pagarMeEncryptionKey;
    if (!encKey) {
      return Promise.reject(new Error('Chave de criptografia Pagar.me não configurada. Adicione pagarMeEncryptionKey no config.'));
    }
    if (typeof pagarme === 'undefined') {
      return Promise.reject(new Error('Biblioteca Pagar.me não carregada.'));
    }
    return pagarme.client
      .connect({ encryption_key: encKey })
      .then(function (client) {
        return client.security.encrypt(cardData);
      });
  }

  function parseExp(expStr) {
    const m = String(expStr || '').replace(/\D/g, '');
    if (m.length >= 4) {
      return { month: m.slice(0, 2), year: m.slice(2, 4) };
    }
    return null;
  }

  // Inicialização
  const plan = getPlan();
  const user = getUser();

  if (!plan) {
    document.getElementById('noPlan')?.classList.remove('hidden');
  } else if (AVULSOS.includes(plan.id)) {
    document.getElementById('checkoutAvulso')?.classList.remove('hidden');
    document.getElementById('avulsoPlanId').value = plan.id;
    document.getElementById('avulsoTitle').textContent = 'Checkout — ' + plan.name;
    document.getElementById('avulsoPlan').textContent =
      plan.description + ' — ' + (plan.amount / 100).toFixed(2).replace('.', ',') + ' (único)';
    if (user?.email) document.getElementById('avulsoEmail').value = user.email;
    if (user?.name) document.getElementById('avulsoName').value = user.name;
  } else {
    document.getElementById('checkoutMensal')?.classList.remove('hidden');
    document.getElementById('mensalPlanId').value = plan.id;
    document.getElementById('mensalTitle').textContent = 'Assinatura — ' + plan.name;
    document.getElementById('mensalPlan').textContent =
      plan.description + ' — R$ ' + (plan.amount / 100).toFixed(2).replace('.', ',') + '/mês';
    if (user?.email) document.getElementById('mensalEmail').value = user.email;
    if (user?.name) document.getElementById('mensalName').value = user.name;
  }

  // Tabs Pix / Cartão (avulsos)
  document.querySelectorAll('.pm-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      const method = tab.dataset.method;
      document.querySelectorAll('.pm-tab').forEach(function (t) {
        t.classList.toggle('active', t.dataset.method === method);
      });
      const cardFields = document.getElementById('cardFieldsAvulso');
      const btn = document.getElementById('btnAvulsoSubmit');
      const btnTxt = btn?.querySelector('.btn-text');
      if (method === 'pix') {
        cardFields?.classList.add('hidden');
        if (btnTxt) btnTxt.textContent = 'Gerar Pix';
      } else {
        cardFields?.classList.remove('hidden');
        if (btnTxt) btnTxt.textContent = 'Pagar com cartão';
      }
      hideError();
    });
  });

  // Submit avulso (Pix ou Cartão)
  document.getElementById('formAvulso')?.addEventListener('submit', function (e) {
    e.preventDefault();
    hideError();
    const planId = document.getElementById('avulsoPlanId').value;
    const name = document.getElementById('avulsoName').value.trim();
    const email = document.getElementById('avulsoEmail').value.trim();
    const activeTab = document.querySelector('.pm-tab.active');
    const paymentMethod = activeTab?.dataset.method || 'pix';

    const payload = {
      planId,
      paymentMethod,
      userId: getUserId(),
      customer: { name, email },
    };

    const btn = document.getElementById('btnAvulsoSubmit');
    setLoading(btn, true);

    function doOrder(cardToken) {
      if (cardToken) payload.cardToken = cardToken;
      fetch(getApiBase() + '/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          return r.text().then(function (text) {
            try {
              var data = JSON.parse(text);
              if (!r.ok) throw new Error(data.error || data.message || 'Erro ao criar pedido');
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
          if (paymentMethod === 'pix') {
            const charge = order.charges?.[0];
            const lastTx = charge?.last_transaction;
            const qrCode = lastTx?.qr_code || lastTx?.qr_code_url || lastTx?.pix_image;
            const pixCode = lastTx?.pix_qr_code || lastTx?.qr_code || lastTx?.pix_code || lastTx?.emv;

            document.getElementById('formAvulso')?.classList.add('hidden');
            document.querySelector('.payment-method-tabs')?.classList.add('hidden');
            const successDiv = document.getElementById('pixSuccess');
            successDiv?.classList.remove('hidden');

            const qrContainer = document.getElementById('pixQrContainer');
            const codeToShow = pixCode || qrCode;
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
            if (codeInput && codeToShow) {
              codeInput.value = codeToShow;
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

    if (paymentMethod === 'credit_card') {
      const cardNum = document.getElementById('avulsoCardNumber').value.replace(/\D/g, '');
      const cardName = document.getElementById('avulsoCardName').value.trim();
      const exp = document.getElementById('avulsoCardExp').value;
      const cvv = document.getElementById('avulsoCardCvv').value;
      const parsed = parseExp(exp);
      if (!cardNum || !cardName || !parsed) {
        showError('Preencha todos os dados do cartão.');
        setLoading(btn, false);
        return;
      }
      tokenizeCard({
        card_number: cardNum,
        card_holder_name: cardName,
        card_expiration_date: parsed.month + parsed.year,
        card_cvv: cvv,
      })
        .then(function (hash) {
          payload.cardToken = hash;
          doOrder(hash);
        })
        .catch(function (err) {
          showError(err.message || 'Erro ao tokenizar cartão. Verifique a chave de criptografia.');
          setLoading(btn, false);
        });
    } else {
      doOrder();
    }
  });

  // Submit mensal (Cartão)
  document.getElementById('formMensal')?.addEventListener('submit', function (e) {
    e.preventDefault();
    hideError();
    const planId = document.getElementById('mensalPlanId').value;
    const name = document.getElementById('mensalName').value.trim();
    const email = document.getElementById('mensalEmail').value.trim();
    const cardNum = document.getElementById('mensalCardNumber').value.replace(/\D/g, '');
    const cardName = document.getElementById('mensalCardName').value.trim();
    const exp = document.getElementById('mensalCardExp').value;
    const cvv = document.getElementById('mensalCardCvv').value;
    const parsed = parseExp(exp);

    if (!name || !email || !cardNum || !cardName || !parsed) {
      showError('Preencha todos os campos.');
      return;
    }

    const btn = document.getElementById('btnMensalSubmit');
    setLoading(btn, true);

    const encKey = window.VARVOS_CONFIG?.pagarMeEncryptionKey;
    const useToken = encKey && typeof pagarme !== 'undefined';

    function doSubscription(cardToken) {
      const payload = {
        planId,
        userId: getUserId(),
        customer: { name, email },
      };
      if (cardToken) {
        payload.cardToken = cardToken;
      } else {
        payload.card = {
          holder_name: cardName,
          number: cardNum,
          exp_month: parsed.month,
          exp_year: parsed.year,
          cvv: cvv,
          billing_address: {
            line_1: 'N/A',
            zip_code: '00000000',
            city: 'N/A',
            state: 'SP',
            country: 'BR',
          },
        };
      }

      fetch(getApiBase() + '/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          return r.text().then(function (text) {
            try {
              var data = JSON.parse(text);
              if (!r.ok) throw new Error(data.error || data.message || 'Erro ao criar assinatura');
              return data;
            } catch (e) {
              if (text.trim().startsWith('<')) {
                throw new Error('A API de pagamento não está respondendo. Use "npx vercel dev" (não "serve") para testar localmente.');
              }
              throw e;
            }
          });
        })
        .then(function () {
          document.getElementById('checkoutSuccess')?.classList.remove('hidden');
          document.getElementById('checkoutMensal')?.classList.add('hidden');
          document.getElementById('successMsg').textContent =
            'Assinatura ativada! Seus créditos mensais foram creditados. A renovação é automática.';
        })
        .catch(function (err) {
          showError(err.message || 'Erro ao processar. Tente novamente.');
        })
        .finally(function () {
          setLoading(btn, false);
        });
    }

    if (useToken) {
      tokenizeCard({
        card_number: cardNum,
        card_holder_name: cardName,
        card_expiration_date: parsed.month + parsed.year,
        card_cvv: cvv,
      })
        .then(doSubscription)
        .catch(function (err) {
          showError(err.message || 'Erro ao tokenizar cartão.');
          setLoading(btn, false);
        });
    } else {
      doSubscription();
    }
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

  // Formatar validade MM/AA
  function formatExp(input) {
    input.addEventListener('input', function () {
      let v = this.value.replace(/\D/g, '');
      if (v.length >= 2) {
        v = v.substring(0, 2) + '/' + v.substring(2, 4);
      }
      this.value = v.substring(0, 5);
    });
  }
  ['avulsoCardExp', 'mensalCardExp'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) formatExp(el);
  });
})();
