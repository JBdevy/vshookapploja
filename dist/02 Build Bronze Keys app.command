#!/bin/bash
# Equivalente macOS de "02 Build Bronze Keys app.bat".
set -euo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

finish() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    printf '\nERRO: o envio não foi concluído. Confira a mensagem acima.\n'
    printf 'Commits ou tags já criados foram preservados; nenhum envio foi forçado.\n'
  fi
  if [ -t 0 ]; then read -r -p 'Pressione Enter para fechar...' _ || true; fi
  exit "$status"
}
trap finish EXIT
fail() { printf '\nERRO: %s\n' "$*" >&2; exit 1; }

cd -- "$(dirname -- "$0")"
printf '\nBUILD BRONZE KEYS — APK, AAB E IPA\n\n'
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail 'Esta pasta não é um repositório Git.'
git lfs version >/dev/null 2>&1 || fail 'Git LFS não está instalado. Instale o Git LFS antes de enviar os arquivos de áudio.'
git lfs install --local >/dev/null || fail 'Não foi possível configurar o Git LFS neste repositório.'
branch=$(git symbolic-ref --quiet --short HEAD) || fail 'Selecione uma branch antes de executar.'
package_version=$(/usr/bin/plutil -extract version raw -o - 'Hook Keys/package.json')
read -r -p "Versão do Bronze Keys [$package_version]: " version || exit 1
version=${version:-$package_version}
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'Use uma versão como 1.0.0.'

printf 'Consultando tags locais e do GitHub para calcular o próximo build...\n'
local_tags=$(git tag --list 'hook-keys-v*-build*')
remote_tags=$(git ls-remote --tags --refs origin 'refs/tags/hook-keys-v*-build*') || fail 'Não foi possível consultar as tags remotas.'
greatest=0
while IFS= read -r line; do
  tag=${line##*$'\t'}
  tag=${tag#refs/tags/}
  if [[ "$tag" =~ ^hook-keys-v[0-9]+\.[0-9]+\.[0-9]+-build([1-9][0-9]*)$ ]]; then
    number=${BASH_REMATCH[1]}
    [ "${#number}" -le 10 ] || fail 'O maior build excede o limite Android.'
    [ "$number" -lt 2100000000 ] || fail 'O maior build atingiu o limite Android.'
    if [ "$number" -gt "$greatest" ]; then greatest=$number; fi
  fi
done <<< "$local_tags
$remote_tags"
build=$((greatest + 1))
tag_name="hook-keys-v${version}-build${build}"
default_message="Bronze Keys $version build $build"
read -r -p "Mensagem do commit [$default_message]: " commit_message || exit 1
commit_message=${commit_message:-$default_message}

# Evita incluir arquivos de outros projetos que já estejam preparados no índice.
while IFS= read -r -d '' staged_path; do
  case "$staged_path" in
    'Hook Keys/'*|'.github/workflows/hook-keys-release.yml'|'02 Build Bronze Keys app.bat'|'02 Build Bronze Keys app.command'|'proximo-build.ps1') ;;
    *) fail "Há um arquivo de outro projeto preparado para commit: $staged_path. Finalize esse commit ou retire-o da área de staging antes de continuar." ;;
  esac
done < <(git diff --cached --name-only -z)

printf '\nProjeto: Bronze Keys\nBranch: %s\nVersão: %s\nPróximo build: %s\nTag: %s\n\n' "$branch" "$version" "$build" "$tag_name"
read -r -p 'Confirma o commit, push e build do Bronze Keys no GitHub? [S/N]: ' confirmation || exit 1
case "$confirmation" in
  [sS]|[sS][iI][mM]) ;;
  *) printf '\nOperação cancelada. Nada foi enviado.\n'; exit 0 ;;
esac

if git show-ref --tags --verify --quiet "refs/tags/$tag_name"; then
  fail "A tag $tag_name já existe localmente. Execute novamente para recalcular."
fi
remote_status=0
git ls-remote --exit-code --tags origin "refs/tags/$tag_name" >/dev/null || remote_status=$?
case "$remote_status" in
  2) ;;
  0) fail "A tag $tag_name já existe no GitHub. Execute novamente para recalcular." ;;
  *) fail 'Não foi possível confirmar a disponibilidade da tag remota.' ;;
esac

git add -- '.github/workflows/hook-keys-release.yml' 'Hook Keys' '02 Build Bronze Keys app.bat' '02 Build Bronze Keys app.command' 'proximo-build.ps1'
# Um commit próprio identifica cada disparo, mesmo sem alterações de arquivos.
git commit --allow-empty -m "$commit_message"
git -c push.followTags=false push origin "refs/heads/$branch:refs/heads/$branch"
git tag -a "$tag_name" -m "$commit_message"
git -c push.followTags=false push origin "refs/tags/$tag_name:refs/tags/$tag_name"

printf '\nBRONZE KEYS DISPARADO\nNenhuma compilação foi feita neste computador.\n'
printf 'O GitHub Actions vai executar o workflow de APK, AAB e IPA do Bronze Keys.\n'
printf 'Acompanhe o resultado em:\nhttps://github.com/JBdevy/vshookapploja/actions\n'
