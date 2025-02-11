import { PushpinOutlined } from '@ant-design/icons'
import ModelTags from '@renderer/components/ModelTags'
import { getModelLogo, isEmbeddingModel } from '@renderer/config/models'
import db from '@renderer/databases'
import { useProviders } from '@renderer/hooks/useProvider'
import { EVENT_NAMES, EventEmitter } from '@renderer/services/EventService'
import { getModelUniqId } from '@renderer/services/ModelService'
import { Model } from '@renderer/types'
import { Avatar, Dropdown, Tooltip } from 'antd'
import { first, sortBy } from 'lodash'
import { FC, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled, { createGlobalStyle } from 'styled-components'

interface Props {
  mentionModels: Model[]
  onMentionModel: (model: Model) => void
  ToolbarButton: any
}

const MentionModelsButton: FC<Props> = ({ mentionModels, onMentionModel: onSelect, ToolbarButton }) => {
  const { providers } = useProviders()
  const [pinnedModels, setPinnedModels] = useState<string[]>([])
  const { t } = useTranslation()
  const dropdownRef = useRef<any>(null)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const togglePin = async (modelId: string) => {
    const newPinnedModels = pinnedModels.includes(modelId)
      ? pinnedModels.filter((id) => id !== modelId)
      : [...pinnedModels, modelId]

    await db.settings.put({ id: 'pinned:models', value: newPinnedModels })
    setPinnedModels(newPinnedModels)
  }

  const handleModelSelect = (model: Model) => {
    // Check if model is already selected
    if (mentionModels.some((selected) => selected.id === model.id)) {
      return
    }
    onSelect(model)
    setIsOpen(false)
  }

  const modelMenuItems = useMemo(() => {
    const items = providers
      .filter((p) => p.models && p.models.length > 0)
      .map((p) => {
        const filteredModels = sortBy(p.models, ['group', 'name'])
          .filter((m) => !isEmbeddingModel(m))
          // Filter out already selected models
          // .filter((m) => !mentionModels.some((selected) => selected.id === m.id))
          .map((m) => ({
            key: getModelUniqId(m),
            model: m,
            label: (
              <ModelItem>
                <ModelNameRow>
                  {pinnedModels.includes(getModelUniqId(m)) ? (
                    <>
                      <span>
                        {m?.name} | {p.name}
                      </span>{' '}
                      <ModelTags model={m} />
                    </>
                  ) : (
                    <>
                      <span>{m?.name}</span> <ModelTags model={m} />
                    </>
                  )}
                </ModelNameRow>
                <PinIcon
                  onClick={(e) => {
                    e.stopPropagation()
                    togglePin(getModelUniqId(m))
                  }}
                  $isPinned={pinnedModels.includes(getModelUniqId(m))}>
                  <PushpinOutlined />
                </PinIcon>
              </ModelItem>
            ),
            icon: (
              <Avatar src={getModelLogo(m.id)} size={24}>
                {first(m.name)}
              </Avatar>
            ),
            onClick: () => handleModelSelect(m)
          }))

        return filteredModels.length > 0
          ? {
              key: p.id,
              label: p.isSystem ? t(`provider.${p.id}`) : p.name,
              type: 'group' as const,
              children: filteredModels
            }
          : null
      })
      .filter((group): group is NonNullable<typeof group> => group !== null)

    if (pinnedModels.length > 0) {
      const pinnedItems = items
        .flatMap((p) => p.children)
        .filter((m) => pinnedModels.includes(m.key))
        .map((m) => ({ ...m, key: m.key + 'pinned' }))

      if (pinnedItems.length > 0) {
        items.unshift({
          key: 'pinned',
          label: t('models.pinned'),
          type: 'group' as const,
          children: pinnedItems
        })
      }
    }

    // Remove empty groups
    return items.filter((group) => group.children.length > 0)
  }, [providers, pinnedModels, t, onSelect, mentionModels])

  // Get flattened list of all model items
  const flatModelItems = useMemo(() => {
    return modelMenuItems.flatMap((group) => group?.children || [])
  }, [modelMenuItems])

  useEffect(() => {
    const loadPinnedModels = async () => {
      const setting = await db.settings.get('pinned:models')
      setPinnedModels(setting?.value || [])
    }
    loadPinnedModels()
  }, [])

  useEffect(() => {
    const showModelSelector = () => {
      dropdownRef.current?.click()
      setIsOpen(true)
      setSelectedIndex(0)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev < flatModelItems.length - 1 ? prev + 1 : prev))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (selectedIndex >= 0 && selectedIndex < flatModelItems.length) {
          const selectedModel = flatModelItems[selectedIndex].model
          if (!mentionModels.some((selected) => selected.id === selectedModel.id)) {
            flatModelItems[selectedIndex].onClick()
          }
          setIsOpen(false)
        }
      } else if (e.key === 'Escape') {
        setIsOpen(false)
      }

      // Scroll selected item into view
      const selectedItem = menuRef.current?.querySelectorAll('.ant-dropdown-menu-item')[selectedIndex]
      selectedItem?.scrollIntoView({ block: 'nearest' })
    }

    EventEmitter.on(EVENT_NAMES.SHOW_MODEL_SELECTOR, showModelSelector)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      EventEmitter.off(EVENT_NAMES.SHOW_MODEL_SELECTOR, showModelSelector)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, selectedIndex, flatModelItems])

  // Hide dropdown if no models available
  if (flatModelItems.length === 0) {
    return null
  }

  const menu = (
    <div ref={menuRef} className="ant-dropdown-menu">
      {modelMenuItems.map((group, groupIndex) => {
        if (!group) return null

        // Calculate the starting index for this group's items
        const startIndex = modelMenuItems.slice(0, groupIndex).reduce((acc, g) => acc + (g?.children?.length || 0), 0)

        return (
          <div key={group.key} className="ant-dropdown-menu-item-group">
            <div className="ant-dropdown-menu-item-group-title">{group.label}</div>
            <div>
              {group.children.map((item, idx) => (
                <div
                  key={item.key}
                  className={`ant-dropdown-menu-item ${selectedIndex === startIndex + idx ? 'ant-dropdown-menu-item-selected' : ''}`}
                  onClick={item.onClick}>
                  <span className="ant-dropdown-menu-item-icon">{item.icon}</span>
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <>
      <DropdownMenuStyle />
      <Dropdown
        dropdownRender={() => menu}
        trigger={['click']}
        open={isOpen}
        onOpenChange={setIsOpen}
        overlayClassName="mention-models-dropdown">
        <Tooltip placement="top" title={t('agents.edit.model.select.title')} arrow>
          <ToolbarButton type="text" ref={dropdownRef}>
            <i className="iconfont icon-at" style={{ fontSize: 18 }}></i>
          </ToolbarButton>
        </Tooltip>
      </Dropdown>
    </>
  )
}

const DropdownMenuStyle = createGlobalStyle`
  .mention-models-dropdown {
    .ant-dropdown-menu {
      max-height: 400px;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 4px 0;

      &::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }

      &::-webkit-scrollbar-thumb {
        background: var(--color-scrollbar);
        border-radius: 3px;
      }

      &::-webkit-scrollbar-track {
        background: transparent;
      }
    }

    .ant-dropdown-menu-item-group {
      .ant-dropdown-menu-item-group-title {
        padding: 5px 12px;
        color: var(--color-text-3);
        font-size: 12px;
      }
    }

    .ant-dropdown-menu-item {
      padding: 5px 12px;
      cursor: pointer;
      transition: all 0.3s;
      display: flex;
      align-items: center;
      gap: 8px;

      &:hover {
        background: var(--color-hover);
      }

      &.ant-dropdown-menu-item-selected {
        background-color: var(--color-primary-bg);
        color: var(--color-primary);
      }

      .ant-dropdown-menu-item-icon {
        margin-right: 0;
      }
    }
  }
`

const ModelItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  width: 100%;
  min-width: 200px;
  gap: 16px;

  &:hover {
    .pin-icon {
      opacity: 0.3;
    }
  }
`

const ModelNameRow = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
`

const PinIcon = styled.span.attrs({ className: 'pin-icon' })<{ $isPinned: boolean }>`
  margin-left: auto;
  padding: 0 8px;
  opacity: ${(props) => (props.$isPinned ? 1 : 'inherit')};
  transition: opacity 0.2s;
  right: 0;
  color: ${(props) => (props.$isPinned ? 'var(--color-primary)' : 'inherit')};
  transform: ${(props) => (props.$isPinned ? 'rotate(-45deg)' : 'none')};
  opacity: 0;

  &:hover {
    opacity: 1 !important;
    color: ${(props) => (props.$isPinned ? 'var(--color-primary)' : 'inherit')};
  }
`

export default MentionModelsButton
