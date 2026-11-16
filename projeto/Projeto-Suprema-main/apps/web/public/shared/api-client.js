'use strict';
window.SupremaAPI = {
  async request(url, options = {}) {
    let response;
    try {
      response = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers: {
          ...(options.body instanceof FormData ? {} : {'Content-Type': 'application/json'}),
          ...options.headers
        }
      });
    } catch {
      throw Error('Servidor de dados indisponivel. Nenhuma confirmacao de salvamento foi recebida. Tente novamente.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && !['/api/login', '/api/me'].includes(url))
        window.dispatchEvent(new Event('suprema-session-expired'));
      const error = Error(data.error || 'Nao foi possivel concluir a operacao.');
      error.status = response.status;
      error.code = data.code;
      throw error;
    }
    return data;
  }
};
