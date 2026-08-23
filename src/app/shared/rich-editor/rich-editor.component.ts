import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { Editor } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import StarterKit from '@tiptap/starter-kit';
import { addIcons } from 'ionicons';
import {
  arrowRedoOutline,
  arrowUndoOutline,
  linkOutline,
  listOutline,
  removeOutline,
  returnDownBackOutline,
  returnDownForwardOutline,
} from 'ionicons/icons';
import { EMPTY_DOC } from '../../core/models/diary.models';

@Component({
  selector: 'app-rich-editor',
  templateUrl: './rich-editor.component.html',
  styleUrls: ['./rich-editor.component.scss'],
  imports: [IonButton, IonIcon],
  host: {
    '[class.editor-focused]': 'editorFocused()',
    '[class.selection-active]': 'selectionActive()',
  },
})
export class RichEditorComponent implements AfterViewInit, OnDestroy {
  readonly initialContent = input(EMPTY_DOC);
  readonly contentChanged = output<{ json: string; text: string }>();
  readonly editorHost = viewChild.required<ElementRef<HTMLElement>>('editorHost');
  private readonly editorRevision = signal(0);
  readonly editorFocused = signal(false);
  readonly selectionActive = signal(false);
  editor?: Editor;

  constructor() {
    addIcons({
      arrowUndoOutline,
      arrowRedoOutline,
      linkOutline,
      listOutline,
      removeOutline,
      returnDownBackOutline,
      returnDownForwardOutline,
    });
    effect(() => {
      const value = this.initialContent();
      if (!this.editor || JSON.stringify(this.editor.getJSON()) === value) return;
      try {
        this.editor.commands.setContent(JSON.parse(value) as object, { emitUpdate: true });
      } catch {
        /* Keep the current valid document. */
      }
    });
  }

  ngAfterViewInit(): void {
    let content: object;
    try {
      content = JSON.parse(this.initialContent()) as object;
    } catch {
      content = JSON.parse(EMPTY_DOC) as object;
    }
    this.editor = new Editor({
      element: this.editorHost().nativeElement,
      extensions: [
        StarterKit.configure({ link: false, underline: false }),
        Underline,
        Highlight.configure({ multicolor: false }),
        Link.configure({ openOnClick: false, autolink: true }),
        TaskList,
        TaskItem.configure({ nested: true }),
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
      ],
      content,
      editorProps: { attributes: { class: 'life-leaf-editor', 'aria-label': 'Diary content', spellcheck: 'true' } },
      onTransaction: () => this.editorRevision.update(value => value + 1),
      onFocus: () => this.editorFocused.set(true),
      onBlur: () => {
        window.setTimeout(() => {
          if (this.editor?.isFocused) return;
          this.editorFocused.set(false);
          this.selectionActive.set(false);
        }, 120);
      },
      onSelectionUpdate: ({ editor }: { editor: Editor }) => {
        const { from, to } = editor.state.selection;
        this.selectionActive.set(editor.isFocused && from !== to);
      },
      onUpdate: ({ editor }: { editor: Editor }) =>
        this.contentChanged.emit({ json: JSON.stringify(editor.getJSON()), text: editor.getText() }),
    });
  }

  toggle(
    name:
      | 'bold'
      | 'italic'
      | 'strike'
      | 'underline'
      | 'highlight'
      | 'bulletList'
      | 'orderedList'
      | 'taskList'
      | 'blockquote'
      | 'code',
  ): void {
    const chain = this.editor?.chain().focus();
    if (!chain) return;
    if (name === 'bold') chain.toggleBold().run();
    if (name === 'italic') chain.toggleItalic().run();
    if (name === 'strike') chain.toggleStrike().run();
    if (name === 'underline') chain.toggleUnderline().run();
    if (name === 'highlight') chain.toggleHighlight().run();
    if (name === 'bulletList') chain.toggleBulletList().run();
    if (name === 'orderedList') chain.toggleOrderedList().run();
    if (name === 'taskList') chain.toggleTaskList().run();
    if (name === 'blockquote') chain.toggleBlockquote().run();
    if (name === 'code') chain.toggleCode().run();
  }

  heading(level: 1 | 2): void {
    this.editor?.chain().focus().toggleHeading({ level }).run();
  }
  align(value: 'left' | 'center' | 'right'): void {
    this.editor?.chain().focus().setTextAlign(value).run();
  }
  divider(): void {
    this.editor?.chain().focus().setHorizontalRule().run();
  }
  indentList(direction: 'in' | 'out'): void {
    const item = this.active('taskItem') ? 'taskItem' : 'listItem';
    const chain = this.editor?.chain().focus();
    if (!chain) return;
    if (direction === 'in') chain.sinkListItem(item).run();
    else chain.liftListItem(item).run();
  }
  canIndentList(direction: 'in' | 'out'): boolean {
    const item = this.active('taskItem') ? 'taskItem' : this.active('listItem') ? 'listItem' : undefined;
    if (!item || !this.editor) return false;
    const chain = this.editor.can().chain().focus();
    return direction === 'in' ? chain.sinkListItem(item).run() : chain.liftListItem(item).run();
  }
  undo(): void {
    this.editor?.chain().focus().undo().run();
  }
  redo(): void {
    this.editor?.chain().focus().redo().run();
  }
  link(): void {
    const previous = this.editor?.getAttributes('link')['href'] as string | undefined;
    const href = window.prompt('Link address', previous ?? 'https://');
    if (href === null) return;
    if (!href.trim()) this.editor?.chain().focus().unsetLink().run();
    else this.editor?.chain().focus().extendMarkRange('link').setLink({ href }).run();
  }
  active(name: string, attributes?: object): boolean {
    this.editorRevision();
    return this.editor?.isActive(name, attributes) ?? false;
  }
  ngOnDestroy(): void {
    this.editor?.destroy();
  }
}
