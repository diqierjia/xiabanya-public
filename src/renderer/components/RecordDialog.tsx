import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { CATEGORIES } from '../lib/constants';
import type { RecordUpsertDTO } from '../lib/types';
import { formatDateTimeLocalInput, formatUtcStorageDateTime } from '../../shared/time';

interface RecordDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (dto: RecordUpsertDTO) => void;
}

export function RecordDialog({ open, onClose, onSave }: RecordDialogProps) {
  const now = new Date();
  const defaultStart = formatDateTimeLocalInput(new Date(now.getTime() - 30 * 60000));
  const defaultEnd = formatDateTimeLocalInput(now);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('开发');
  const [app, setApp] = useState('');
  const [startAt, setStartAt] = useState(defaultStart);
  const [endAt, setEndAt] = useState(defaultEnd);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      const current = new Date();
      const s = formatDateTimeLocalInput(new Date(current.getTime() - 30 * 60000));
      const e = formatDateTimeLocalInput(current);
      setStartAt(s);
      setEndAt(e);
      setTitle('');
      setCategory('开发');
      setApp('');
      setNotes('');
    }
  }, [open]);

  if (!open) return null;

  const handleSave = () => {
    onSave({
      title: title || '工作记录',
      category: category as any,
      app,
      window_title: '',
      start_at: formatUtcStorageDateTime(new Date(startAt)),
      end_at: formatUtcStorageDateTime(new Date(endAt)),
      notes,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">添加工作记录</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">任务标题</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="正在做什么..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">应用</label>
              <input
                type="text"
                value={app}
                onChange={(e) => setApp(e.target.value)}
                placeholder="例如：VS Code"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">开始时间</label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">结束时间</label>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">内容备注</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="补充说明..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
            取消
          </button>
          <button onClick={handleSave} className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
