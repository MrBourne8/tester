# UniTest Player (Tauri 2)

Нативная оболочка автономного плеера (Windows проверен; macOS/Linux — см. `docs/CROSS_PLATFORM.md`).

Приоритет загрузки теста:
1. overlay в конце самого EXE (экспорт «Автономный пакет» — один файл);
2. иначе `resources/quiz-data.js` (удобно для разработки).

## Уже установлено в этом окружении

| Компонент | Версия / путь |
|-----------|----------------|
| Rust | 1.99.1 (`stable-x86_64-pc-windows-msvc`) |
| Cargo | 1.99.1 |
| MSVC Build Tools | VS 2022 BuildTools + VC Tools |
| WebView2 | Runtime присутствует |
| `@tauri-apps/cli` | в `package.json` |

## Сборка

В Developer PowerShell / после `Launch-VsDevShell.ps1`:

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path
cd D:\OSPanel\domains\localhost\tester
npm run native:windows
```

Артефакты:

```text
src-tauri/target/release/unitest-player.exe
dist/native/windows/unitest-player.exe   ← деплой на сервер (см. docs/NATIVE_PLAYER.md)
src-tauri/target/release/bundle/nsis/UniTest Player_0.1.0_x64-setup.exe
```

При экспорте PHP дописывает `quiz-data.js` в конец копии EXE (magic `UNITSTQ1`).
Для отладки плеера можно положить `src-tauri/resources/quiz-data.js`.

## Dev

```powershell
npm run tauri:dev
```

## Проверенная сборка

Фактически собрано: EXE + NSIS installer (см. `docs/BUILD.md`).
