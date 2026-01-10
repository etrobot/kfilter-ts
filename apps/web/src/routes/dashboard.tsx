import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/dashboard")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({
        to: "/login",
        throw: true,
      });
    }
    
    // 检查是否为admin用户
    if (!session.data.user.isAdmin) {
      redirect({
        to: "/",
        throw: true,
      });
    }
    
    return { session };
  },
});

function RouteComponent() {
  const { session } = Route.useRouteContext();
  const queryClient = useQueryClient();
  
  // 获取用户列表
  const usersQuery = useQuery({
    queryKey: ["user", "getAll"],
    queryFn: () => trpc.user.getAll.query(),
  });
  
  // 创建用户表单状态
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    isAdmin: false,
  });
  
  // 编辑用户状态
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    isAdmin: false,
    emailVerified: false,
  });

  // 创建用户mutation
  const createUserMutation = useMutation({
    mutationFn: (data: typeof createForm) => trpc.user.create.mutate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user", "getAll"] });
      setCreateForm({ name: "", email: "", isAdmin: false });
      toast.success("用户创建成功");
    },
    onError: (error) => {
      toast.error(error.message || "创建用户失败");
    },
  });

  // 更新用户mutation
  const updateUserMutation = useMutation({
    mutationFn: (data: { id: string; name: string; email: string; isAdmin: boolean; emailVerified: boolean }) => 
      trpc.user.update.mutate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user", "getAll"] });
      setEditingUser(null);
      toast.success("用户更新成功");
    },
    onError: (error) => {
      toast.error(error.message || "更新用户失败");
    },
  });

  // 删除用户mutation
  const deleteUserMutation = useMutation({
    mutationFn: (data: { id: string }) => trpc.user.delete.mutate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user", "getAll"] });
      toast.success("用户删除成功");
    },
    onError: (error) => {
      toast.error(error.message || "删除用户失败");
    },
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim() || !createForm.email.trim()) {
      toast.error("请填写完整信息");
      return;
    }
    createUserMutation.mutate(createForm);
  };

  const handleEditUser = (user: any) => {
    setEditingUser(user.id);
    setEditForm({
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      emailVerified: user.emailVerified,
    });
  };

  const handleUpdateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    
    updateUserMutation.mutate({
      id: editingUser,
      ...editForm,
    });
  };

  const handleDeleteUser = (userId: string) => {
    if (confirm("确定要删除这个用户吗？此操作不可撤销。")) {
      deleteUserMutation.mutate({ id: userId });
    }
  };

  if (usersQuery.isLoading) {
    return <div className="p-6">加载中...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">管理员面板</h1>
          <p className="text-muted-foreground">欢迎, {session.data?.user.name}</p>
        </div>
      </div>

      {/* 创建用户表单 */}
      <Card>
        <CardHeader>
          <CardTitle>创建新用户</CardTitle>
          <CardDescription>添加新的用户账户</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">姓名</Label>
                <Input
                  id="name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="输入用户姓名"
                />
              </div>
              <div>
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="输入用户邮箱"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isAdmin"
                checked={createForm.isAdmin}
                onCheckedChange={(checked) => 
                  setCreateForm(prev => ({ ...prev, isAdmin: checked as boolean }))
                }
              />
              <Label htmlFor="isAdmin">管理员权限</Label>
            </div>
            <Button 
              type="submit" 
              disabled={createUserMutation.isPending}
            >
              {createUserMutation.isPending ? "创建中..." : "创建用户"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 用户列表 */}
      <Card>
        <CardHeader>
          <CardTitle>用户管理</CardTitle>
          <CardDescription>管理系统中的所有用户</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>姓名</TableHead>
                <TableHead>邮箱</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>权限</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersQuery.data?.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    {editingUser === user.id ? (
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full"
                      />
                    ) : (
                      user.name
                    )}
                  </TableCell>
                  <TableCell>
                    {editingUser === user.id ? (
                      <Input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full"
                      />
                    ) : (
                      user.email
                    )}
                  </TableCell>
                  <TableCell>
                    {editingUser === user.id ? (
                      <Checkbox
                        checked={editForm.emailVerified}
                        onCheckedChange={(checked) => 
                          setEditForm(prev => ({ ...prev, emailVerified: checked as boolean }))
                        }
                      />
                    ) : (
                      <Badge variant={user.emailVerified ? "default" : "secondary"}>
                        {user.emailVerified ? "已验证" : "未验证"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingUser === user.id ? (
                      <Checkbox
                        checked={editForm.isAdmin}
                        onCheckedChange={(checked) => 
                          setEditForm(prev => ({ ...prev, isAdmin: checked as boolean }))
                        }
                      />
                    ) : (
                      <Badge variant={user.isAdmin ? "destructive" : "outline"}>
                        {user.isAdmin ? "管理员" : "普通用户"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      {editingUser === user.id ? (
                        <>
                          <Button
                            size="sm"
                            onClick={handleUpdateUser}
                            disabled={updateUserMutation.isPending}
                          >
                            保存
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingUser(null)}
                          >
                            取消
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditUser(user)}
                          >
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteUser(user.id)}
                            disabled={user.id === session.data?.user.id}
                          >
                            删除
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {usersQuery.data?.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              暂无用户数据
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
