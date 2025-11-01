import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
import { Plus, Trash2, CheckCircle2, ListTodo, Sparkles } from 'lucide-react';

const Checklist = () => {
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get('booking_id');
  
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState('');
  const [newCategory, setNewCategory] = useState('Essentials');

  const categories = ['Clothing', 'Toiletries', 'Accessories', 'Essentials', 'Documents', 'Electronics', 'Other'];

  useEffect(() => {
    if (bookingId) {
      fetchChecklistItems(bookingId);
    } else {
      // Load from localStorage if no booking_id
      loadLocalChecklist();
    }
  }, [bookingId]);

  const fetchChecklistItems = async (bId) => {
    try {
      const response = await axios.get(`/api/checklist/items?booking_id=${bId}`);
      setItems(response.data || []);
    } catch (error) {
      console.error('Failed to fetch checklist:', error);
      loadLocalChecklist();
    } finally {
      setLoading(false);
    }
  };

  const loadLocalChecklist = () => {
    const savedItems = localStorage.getItem('wanderlite-checklist');
    if (savedItems) {
      try {
        const parsed = JSON.parse(savedItems);
        // Convert old format to new format
        const converted = parsed.map((item) => ({
          id: item.id?.toString() || Date.now().toString(),
          item_name: item.text || item.item_name,
          category: item.category || 'Essentials',
          is_packed: item.checked || item.is_packed || false,
          is_auto_generated: false,
        }));
        setItems(converted);
      } catch (e) {
        setItems([]);
      }
    }
    setLoading(false);
  };

  const saveToLocalStorage = (updatedItems) => {
    localStorage.setItem('wanderlite-checklist', JSON.stringify(updatedItems));
  };

  const addItem = async () => {
    if (newItem.trim() === '') return;

    if (bookingId) {
      // Save to backend
      try {
        const response = await axios.post('/api/checklist/items', {
          booking_id: bookingId,
          item_name: newItem,
          category: newCategory,
        });
        setItems([...items, response.data]);
        setNewItem('');
      } catch (error) {
        console.error('Failed to add item:', error);
        alert('Failed to add item. Please try again.');
      }
    } else {
      // Save locally
      const newChecklistItem = {
        id: Date.now().toString(),
        item_name: newItem,
        category: newCategory,
        is_packed: false,
        is_auto_generated: false,
      };
      const updated = [...items, newChecklistItem];
      setItems(updated);
      saveToLocalStorage(updated);
      setNewItem('');
    }
  };

  const toggleItem = async (id) => {
    if (bookingId) {
      // Update in backend
      try {
        await axios.put(`/api/checklist/items/${id}`);
        setItems(items.map((item) => (item.id === id ? { ...item, is_packed: !item.is_packed } : item)));
      } catch (error) {
        console.error('Failed to toggle item:', error);
      }
    } else {
      // Update locally
      const updated = items.map((item) => (item.id === id ? { ...item, is_packed: !item.is_packed } : item));
      setItems(updated);
      saveToLocalStorage(updated);
    }
  };

  const deleteItem = async (id) => {
    if (bookingId) {
      // Delete from backend
      try {
        await axios.delete(`/api/checklist/items/${id}`);
        setItems(items.filter((item) => item.id !== id));
      } catch (error) {
        console.error('Failed to delete item:', error);
        alert('Failed to delete item.');
      }
    } else {
      // Delete locally
      const updated = items.filter((item) => item.id !== id);
      setItems(updated);
      saveToLocalStorage(updated);
    }
  };

  const clearCompleted = () => {
    const updated = items.filter((item) => !item.is_packed);
    setItems(updated);
    if (!bookingId) {
      saveToLocalStorage(updated);
    }
  };

  const completedCount = items.filter((item) => item.is_packed).length;
  const totalCount = items.length;
  const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // Group items by category
  const itemsByCategory = items.reduce((acc, item) => {
    const cat = item.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <div className="min-h-screen pt-24 pb-16 bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8 space-y-4">
          <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-[#0077b6] to-[#48cae4] bg-clip-text text-transparent">
            Smart Packing Checklist
          </h1>
          <p className="text-gray-600 text-lg">
            {bookingId ? 'Auto-generated packing list for your trip' : 'Never forget the essentials - organize your packing'}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-[#0077b6]"></div>
          </div>
        ) : (
          <>
            {/* Progress Card */}
            <Card className="p-6 shadow-xl border-0 bg-gradient-to-br from-[#0077b6] to-[#48cae4] text-white mb-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <CheckCircle2 className="w-8 h-8" />
                    <div>
                      <h2 className="text-2xl font-bold">Your Progress</h2>
                      <p className="text-white/90">
                        {completedCount} of {totalCount} items packed
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-4xl font-bold">{Math.round(progressPercentage)}%</div>
                  </div>
                </div>
                <div className="w-full bg-white/30 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-white h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </div>
            </Card>

            {/* Add Item Card */}
            <Card className="p-6 shadow-xl border-0 bg-white mb-6">
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  type="text"
                  placeholder="Add a new item..."
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addItem()}
                  className="flex-1 h-12 border-2 border-gray-200 focus:border-[#0077b6]"
                />
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger className="w-full sm:w-40 h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={addItem}
                  className="h-12 px-6 bg-gradient-to-r from-[#0077b6] to-[#48cae4] hover:from-[#005f8f] hover:to-[#3ab5d9] text-white font-semibold rounded-lg shadow-lg"
                >
                  <Plus className="w-5 h-5" />
                </Button>
              </div>
            </Card>

            {/* Checklist Items by Category */}
            <div className="space-y-6">
              {Object.keys(itemsByCategory).length === 0 ? (
                <Card className="p-12 text-center">
                  <ListTodo className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-600 text-lg mb-4">No items in your checklist yet</p>
                  <p className="text-sm text-gray-500">Add items above to start packing!</p>
                </Card>
              ) : (
                Object.entries(itemsByCategory).map(([category, categoryItems]) => (
                  <Card key={category} className="shadow-xl border-0 bg-white">
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                          <ListTodo className="w-5 h-5 text-[#0077b6]" />
                          {category}
                        </h3>
                        <Badge variant="outline" className="text-[#0077b6]">
                          {categoryItems.filter((i) => i.is_packed).length} / {categoryItems.length}
                        </Badge>
                      </div>

                      <div className="space-y-3">
                        {categoryItems.map((item) => (
                          <div
                            key={item.id}
                            className={`flex items-center space-x-3 p-3 rounded-lg border-2 transition-all duration-200 ${
                              item.is_packed
                                ? 'bg-green-50 border-green-200'
                                : 'bg-white border-gray-200 hover:border-[#0077b6]'
                            }`}
                          >
                            <Checkbox
                              checked={item.is_packed}
                              onCheckedChange={() => toggleItem(item.id)}
                              className="w-5 h-5"
                            />
                            <span
                              className={`flex-1 ${
                                item.is_packed ? 'line-through text-gray-500' : 'text-gray-800'
                              }`}
                            >
                              {item.item_name}
                            </span>
                            {item.is_auto_generated && (
                              <Badge variant="secondary" className="bg-purple-100 text-purple-700 flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                Auto
                              </Badge>
                            )}
                            <Button
                              onClick={() => deleteItem(item.id)}
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                ))
              )}

              {completedCount > 0 && (
                <div className="flex justify-center">
                  <Button
                    onClick={clearCompleted}
                    variant="outline"
                    className="text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear Completed Items
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Checklist;
