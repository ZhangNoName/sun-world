import { useMemo, useRef, useState } from 'react'

import { SunIcon } from '@sun-world/icons/react'
import { Button } from '@sun-world/base-ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@sun-world/base-ui/dialog'

import {
  createBlog,
  deleteBlog,
  fetchBlogById,
  fetchBlogPage,
  updateBlog,
} from '@/modules/blog/api'
import type { BlogRawItem, CreateBlogPayload } from '@/modules/blog/types'
import { getAdminErrorMessage } from '../errors'
import { useManageCopy } from '../manageCopy'
import {
  ManageDataPage,
  type ManageDataPageRef,
} from '../components/ManageDataPage'
import { SchemaForm } from '../components/SchemaForm'
import type { ManageColumn, SchemaField } from '../components/ManageTypes'
import './manage-editors.css'

type BlogEditorValues = Record<string, unknown>

const emptyBlog: BlogEditorValues = {
  title: '',
  abstract: '',
  content: '',
  category: '',
  tags: '',
  author: '',
}

export default function ManageBlogDataPage() {
  const copy = useManageCopy()
  const pageRef = useRef<ManageDataPageRef<BlogRawItem>>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editorValues, setEditorValues] = useState<BlogEditorValues>(emptyBlog)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const columns = useMemo<Array<ManageColumn<BlogRawItem>>>(
    () => [
      {
        key: 'title',
        title: copy.blog.title,
        search: {
          label: copy.blog.keyword,
          placeholder: copy.blog.searchTitle,
        },
        render: ({ row }) => <strong>{row.title || copy.blog.untitled}</strong>,
      },
      {
        key: 'category',
        title: copy.blog.category,
        type: 'number',
        formatter: (value) => (value == null ? '—' : String(value)),
      },
      {
        key: 'tag',
        title: copy.blog.tags,
        render: ({ value }) =>
          Array.isArray(value) && value.length ? value.join(', ') : '—',
      },
      { key: 'byte_num', title: copy.blog.words, type: 'number' },
      { key: 'comment_num', title: copy.blog.comments, type: 'number' },
      { key: 'view_num', title: copy.blog.views, type: 'number' },
      { key: 'updated_at', title: copy.blog.updated, type: 'date' },
      {
        key: 'id',
        title: copy.blog.actions,
        render: ({ row }) => (
          <div className="manage-row-actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void openBlogEditor(row)}
            >
              {copy.blog.edit}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void removeBlog(row)}
            >
              {copy.blog.delete}
            </Button>
          </div>
        ),
      },
    ],
    [copy]
  )

  const fields: Array<SchemaField<BlogEditorValues>> = [
    { name: 'title', label: copy.blog.title, type: 'input', required: true },
    {
      name: 'abstract',
      label: copy.blog.abstract,
      type: 'textarea',
      required: true,
    },
    {
      name: 'content',
      label: copy.blog.content,
      type: 'textarea',
      required: true,
    },
    {
      name: 'category',
      label: copy.blog.categoryId,
      type: 'number',
      required: true,
    },
    {
      name: 'tags',
      label: copy.blog.tags,
      type: 'input',
      placeholder: copy.blog.tagsPlaceholder,
    },
    { name: 'author', label: copy.blog.author, type: 'input' },
  ]

  async function saveBlog(values: BlogEditorValues) {
    if (saving) return
    setSaving(true)
    setErrorMessage('')
    const payload: CreateBlogPayload = {
      title: String(values.title ?? '').trim(),
      abstract: String(values.abstract ?? '').trim(),
      content: String(values.content ?? ''),
      category: Number(values.category),
      tag: String(values.tags ?? '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      author: String(values.author ?? '').trim() || null,
    }
    try {
      if (editingId) await updateBlog(editingId, payload)
      else await createBlog(payload)
      setEditorOpen(false)
      setEditingId(null)
      setEditorValues({ ...emptyBlog })
      await pageRef.current?.refresh()
    } catch (reason) {
      setErrorMessage(getAdminErrorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  async function openBlogEditor(row: BlogRawItem) {
    if (!row.id) return
    setErrorMessage('')
    try {
      const detail = await fetchBlogById(String(row.id))
      setEditingId(String(row.id))
      setEditorValues({
        title: detail.title ?? '',
        abstract: detail.abstract ?? '',
        content: detail.content ?? '',
        category: detail.category ?? '',
        tags: Array.isArray(detail.tag) ? detail.tag.join(', ') : '',
        author: detail.author ?? '',
      })
      setEditorOpen(true)
    } catch (reason) {
      setErrorMessage(getAdminErrorMessage(reason))
    }
  }

  async function removeBlog(row: BlogRawItem) {
    if (!row.id || !window.confirm(copy.blog.confirmDelete(row.title))) return
    setErrorMessage('')
    try {
      await deleteBlog(row.id)
      await pageRef.current?.refresh()
    } catch (reason) {
      setErrorMessage(getAdminErrorMessage(reason))
    }
  }

  return (
    <div className="manage-dictionaries-page">
      {errorMessage ? (
        <p className="manage-editor-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <ManageDataPage
        ref={pageRef}
        title={copy.nav.blog}
        description={copy.blog.description}
        columns={columns}
        rowKey={(row) => row.id ?? row.title}
        fetchPage={async ({ page, pageSize, search }) => {
          const result = await fetchBlogPage(page, pageSize, {
            keyword: String(search.title ?? ''),
            sortBy: String(search.sortBy ?? 'updated_at') as
              | 'updated_at'
              | 'created_at'
              | 'view_num',
            sortOrder: String(search.sortOrder ?? 'desc') as 'asc' | 'desc',
          })
          return {
            rows: result.list ?? [],
            total: result.total ?? 0,
            page: result.page,
            pageSize: result.page_size,
          }
        }}
        toolbar={{
          right: (
            <Button
              onClick={() => {
                setEditingId(null)
                setEditorValues({ ...emptyBlog })
                setEditorOpen(true)
              }}
            >
              <SunIcon name="plus" />
              {copy.blog.newArticle}
            </Button>
          ),
        }}
      />
      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (!open && !saving) setEditorOpen(false)
        }}
      >
        <DialogContent className="manage-editor-drawer">
          <DialogTitle>{copy.blog.editorTitle(Boolean(editingId))}</DialogTitle>
          <DialogDescription>
            {copy.blog.editorDescription(Boolean(editingId))}
          </DialogDescription>
          <SchemaForm
            fields={fields}
            values={editorValues}
            onChange={(name, value) =>
              setEditorValues((current) => ({ ...current, [name]: value }))
            }
            onSubmit={(values) => void saveBlog(values)}
            submitting={saving}
            submitLabel={
              editingId ? copy.blog.saveChanges : copy.blog.createArticle
            }
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
