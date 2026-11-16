PRAGMA foreign_keys = ON;

CREATE TABLE usuarios (
  id                 INTEGER PRIMARY KEY,
  nome               TEXT    NOT NULL,
  email              TEXT    NOT NULL UNIQUE,
  login              TEXT    NOT NULL UNIQUE,
  senha_hash         TEXT    NOT NULL,
  perfil             TEXT    NOT NULL CHECK (perfil IN ('ADMINISTRADOR','PROFESSOR','ALUNO')),
  matricula          TEXT    UNIQUE,
  registro_funcional TEXT,
  curso_id           INTEGER REFERENCES cursos(id),
  ativo              INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  criado_em          TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (perfil <> 'ALUNO' OR (matricula IS NOT NULL AND curso_id IS NOT NULL)),
  CHECK (perfil = 'ALUNO' OR (matricula IS NULL AND curso_id IS NULL))
);

CREATE TABLE cursos (
  id     INTEGER PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nome   TEXT NOT NULL,
  ativo  INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1))
);

CREATE TABLE disciplinas (
  id       INTEGER PRIMARY KEY,
  curso_id INTEGER NOT NULL REFERENCES cursos(id),
  codigo   TEXT    NOT NULL UNIQUE,
  nome     TEXT    NOT NULL,
  ativo    INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1))
);

CREATE TABLE vinculos (
  id             INTEGER PRIMARY KEY,
  usuario_id     INTEGER NOT NULL REFERENCES usuarios(id),
  disciplina_id  INTEGER NOT NULL REFERENCES disciplinas(id),
  tipo           TEXT    NOT NULL CHECK (tipo IN ('DOCENTE','DISCENTE')),
  periodo_letivo TEXT    NOT NULL,
  data_inicio    TEXT    NOT NULL,
  data_fim       TEXT,
  UNIQUE (usuario_id, disciplina_id, periodo_letivo, tipo)
);

CREATE TABLE avaliacoes (
  id              INTEGER PRIMARY KEY,
  disciplina_id   INTEGER NOT NULL REFERENCES disciplinas(id),
  tipo            TEXT    NOT NULL CHECK (tipo IN ('A1','A2')),
  periodo_letivo  TEXT    NOT NULL,
  descricao       TEXT,
  data_aplicacao  TEXT,
  UNIQUE (disciplina_id, tipo, periodo_letivo)
);

CREATE TABLE questoes (
  id            INTEGER PRIMARY KEY,
  avaliacao_id  INTEGER NOT NULL REFERENCES avaliacoes(id),
  numero        INTEGER NOT NULL CHECK (numero > 0),
  enunciado     TEXT,
  valor_maximo  NUMERIC CHECK (valor_maximo IS NULL OR valor_maximo > 0),
  UNIQUE (avaliacao_id, numero)
);

CREATE TABLE publicacoes (
  id            INTEGER PRIMARY KEY,
  avaliacao_id  INTEGER NOT NULL REFERENCES avaliacoes(id),
  professor_id  INTEGER NOT NULL REFERENCES usuarios(id),
  publicado_em  TEXT    NOT NULL DEFAULT (datetime('now')),
  observacao    TEXT
);

CREATE TABLE resultados (
  id               INTEGER PRIMARY KEY,
  avaliacao_id     INTEGER NOT NULL REFERENCES avaliacoes(id),
  aluno_id         INTEGER NOT NULL REFERENCES usuarios(id),
  situacao         TEXT    NOT NULL DEFAULT 'RASCUNHO' CHECK (situacao IN ('RASCUNHO','PUBLICADO')),
  publicacao_id    INTEGER REFERENCES publicacoes(id),
  ultima_alteracao TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (avaliacao_id, aluno_id),
  CHECK ((situacao = 'PUBLICADO') = (publicacao_id IS NOT NULL))
);

CREATE TABLE notas (
  id            INTEGER PRIMARY KEY,
  resultado_id  INTEGER NOT NULL REFERENCES resultados(id),
  questao_id    INTEGER NOT NULL REFERENCES questoes(id),
  valor         NUMERIC NOT NULL CHECK (valor >= 0),
  lancada_por   INTEGER NOT NULL REFERENCES usuarios(id),
  registrada_em TEXT    NOT NULL DEFAULT (datetime('now')),
  alterada_em   TEXT,
  versao        INTEGER NOT NULL DEFAULT 1,
  UNIQUE (resultado_id, questao_id)
);

-- RN06/RN07: nota de resultado publicado é imutável
CREATE TRIGGER trg_nota_imutavel_upd BEFORE UPDATE ON notas
WHEN (SELECT situacao FROM resultados WHERE id = OLD.resultado_id) = 'PUBLICADO'
BEGIN SELECT RAISE(ABORT, 'Nota de resultado publicado não pode ser alterada'); END;

CREATE TRIGGER trg_nota_imutavel_del BEFORE DELETE ON notas
WHEN (SELECT situacao FROM resultados WHERE id = OLD.resultado_id) = 'PUBLICADO'
BEGIN SELECT RAISE(ABORT, 'Nota de resultado publicado não pode ser excluída'); END;

CREATE TRIGGER trg_nota_imutavel_ins BEFORE INSERT ON notas
WHEN (SELECT situacao FROM resultados WHERE id = NEW.resultado_id) = 'PUBLICADO'
BEGIN SELECT RAISE(ABORT, 'Resultado publicado não aceita novas notas'); END;

-- Nota e questão devem ser da mesma avaliação
CREATE TRIGGER trg_nota_mesma_avaliacao BEFORE INSERT ON notas
WHEN (SELECT avaliacao_id FROM questoes WHERE id = NEW.questao_id)
  <> (SELECT avaliacao_id FROM resultados WHERE id = NEW.resultado_id)
BEGIN SELECT RAISE(ABORT, 'Questão não pertence à avaliação do resultado'); END;

-- RN07: resultado publicado não volta a rascunho nem é excluído
CREATE TRIGGER trg_resultado_sem_retorno BEFORE UPDATE OF situacao ON resultados
WHEN OLD.situacao = 'PUBLICADO'
BEGIN SELECT RAISE(ABORT, 'Resultado publicado não pode mudar de situação'); END;

CREATE TRIGGER trg_resultado_sem_exclusao BEFORE DELETE ON resultados
WHEN OLD.situacao = 'PUBLICADO'
BEGIN SELECT RAISE(ABORT, 'Resultado publicado não pode ser excluído'); END;

CREATE TRIGGER trg_publicacao_imutavel BEFORE UPDATE ON publicacoes
BEGIN SELECT RAISE(ABORT, 'Publicação é imutável'); END;
