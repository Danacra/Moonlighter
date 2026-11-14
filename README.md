# Moonlighter Floor Forge

Foundry VTT v13 / D&D 5e: генератор подземелий, комнаты и двери, боевые события, сундуки Item Piles, торговцы и рынок артефактов.

> Экспериментальный модуль: перед установкой сделайте резервную копию мира. Полное тестирование в запущенной Foundry VTT ещё не проводилось.

## Установка через Manifest URL

После того как опубликован первый GitHub Release, откройте Foundry Setup → Add-on Modules → Install Module и вставьте:

`https://raw.githubusercontent.com/Danacra/Moonlighter/main/module.json`

## Первичная публикация (один раз)

1. Скачайте файл `moonlighter-floor-forge.zip` из ChatGPT.
2. В этом репозитории нажмите **Add file → Upload files** и загрузите ZIP **в корень репозитория**, сохранив имя `moonlighter-floor-forge.zip`.
3. Нажмите **Commit changes**.
4. Workflow `Publish Foundry module` автоматически создаст релиз `v0.5.0` и прикрепит ZIP. Проверьте вкладки **Actions** и **Releases**.
5. После появления релиза ссылка Manifest URL выше будет полностью работоспособна.

Ссылка на ZIP в релизе: https://github.com/Danacra/Moonlighter/releases/latest/download/moonlighter-floor-forge.zip

## Будущие обновления

При обновлении модуля нужно изменить `version` в `module.json` и загрузить новый `moonlighter-floor-forge.zip`. Workflow создаст соответствующий релиз и сохранит стабильный адрес установки.

## Совместимость

Foundry VTT v13, D&D 5e. Для интерактивных контейнеров и торговцев рекомендованы Item Piles и Item Piles: D&D 5e.
