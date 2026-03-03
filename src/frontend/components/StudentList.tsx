import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Loader2, Trash2, Users, Database, Upload, Camera } from 'lucide-react';
import { Button } from '@/frontend/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/frontend/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/frontend/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/frontend/components/ui/alert-dialog';
import { Badge } from '@/frontend/components/ui/badge';
import { supabase, type Child, type FaceSignature } from '@/frontend/lib/supabase';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/frontend/components/ui/tabs';
import { StudentEnrolment } from './StudentEnrolment';
import { LiveScanEnrolment } from './LiveScanEnrolment';
import { toast } from 'sonner';

export function StudentList() {
  const [children, setChildren] = useState<Child[]>([]);
  const [signatures, setSignatures] = useState<Record<string, FaceSignature[]>>({});
  const [loading, setLoading] = useState(true);
  const [enrolDialogOpen, setEnrolDialogOpen] = useState(false);
  const [expandedChild, setExpandedChild] = useState<string | null>(null);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const { data: kids } = await supabase
        .from('children')
        .select('*')
        .order('name');
      if (kids) setChildren(kids);

      const { data: sigs } = await supabase
        .from('face_signatures')
        .select('*')
        .order('created_at', { ascending: false });
      if (sigs) {
        const grouped: Record<string, FaceSignature[]> = {};
        for (const sig of sigs) {
          if (!grouped[sig.child_id]) grouped[sig.child_id] = [];
          grouped[sig.child_id].push(sig);
        }
        setSignatures(grouped);
      }
    } catch (err) {
      console.error('Failed to fetch students:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const handleDeleteSignature = async (sigId: string, childId: string) => {
    const { error } = await supabase.from('face_signatures').delete().eq('id', sigId);
    if (error) {
      toast.error('Failed to delete face data');
      return;
    }
    setSignatures((prev) => ({
      ...prev,
      [childId]: prev[childId]?.filter((s) => s.id !== sigId) ?? [],
    }));
    toast.success('Face data removed');
  };

  const handleDeleteChild = async (child: Child) => {
    // Delete signatures first, then child
    await supabase.from('face_signatures').delete().eq('child_id', child.id);
    const { error } = await supabase.from('children').delete().eq('id', child.id);
    if (error) {
      toast.error('Failed to remove student');
      return;
    }
    toast.success(`${child.name} removed`);
    fetchStudents();
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const getFirstThumbnail = (childId: string) => {
    const sigs = signatures[childId];
    return sigs?.find((s) => s.image_url)?.image_url ?? null;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading students...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Users className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Registered Students</h2>
            <p className="text-[11px] text-muted-foreground">
              {children.length} student{children.length !== 1 ? 's' : ''} enrolled
            </p>
          </div>
        </div>

        <Dialog open={enrolDialogOpen} onOpenChange={setEnrolDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="w-4 h-4 mr-1.5" />
              Enrol Student
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Enrol New Student</DialogTitle>
            </DialogHeader>
            <Tabs defaultValue="upload" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="upload" className="flex-1 gap-1.5 text-xs">
                  <Upload className="w-3.5 h-3.5" />
                  Upload Photo
                </TabsTrigger>
                <TabsTrigger value="livescan" className="flex-1 gap-1.5 text-xs">
                  <Camera className="w-3.5 h-3.5" />
                  Live 3D Scan
                </TabsTrigger>
              </TabsList>
              <TabsContent value="upload" className="mt-4">
                <StudentEnrolment
                  onSuccess={() => {
                    setEnrolDialogOpen(false);
                    fetchStudents();
                  }}
                />
              </TabsContent>
              <TabsContent value="livescan" className="mt-4">
                <LiveScanEnrolment
                  onSuccess={() => {
                    setEnrolDialogOpen(false);
                    fetchStudents();
                  }}
                />
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      {/* Empty State */}
      {children.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center">
            <Users className="w-7 h-7 text-muted-foreground/40" />
          </div>
          <p className="text-lg font-semibold text-foreground/50">No students yet</p>
          <p className="text-sm text-muted-foreground max-w-[280px]">
            Enrol students with a photo so the AI can recognise them in classroom images.
          </p>
        </div>
      )}

      {/* Student Cards */}
      <div className="space-y-2">
        {children.map((child) => {
          const childSigs = signatures[child.id] ?? [];
          const thumbnail = getFirstThumbnail(child.id);
          const isExpanded = expandedChild === child.id;

          return (
            <div
              key={child.id}
              className="panel-card rounded-xl border border-border overflow-hidden"
            >
              {/* Main Row */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-secondary/30 transition-colors"
                onClick={() => setExpandedChild(isExpanded ? null : child.id)}
              >
                <Avatar className="w-10 h-10">
                  {thumbnail && <AvatarImage src={thumbnail} alt={child.name} />}
                  <AvatarFallback className="text-xs font-bold">
                    {getInitials(child.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{child.name}</p>
                  <p className="text-xs text-muted-foreground">{child.class_group}</p>
                </div>
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <Database className="w-3 h-3" />
                  {childSigs.length} vector{childSigs.length !== 1 ? 's' : ''}
                </Badge>
              </div>

              {/* Expanded: Face Signature Management */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-1 border-t border-border/50">
                  {childSigs.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">
                      No face data. Re-enrol this student with a photo.
                    </p>
                  ) : (
                    <div className="flex gap-3 flex-wrap pt-2">
                      {childSigs.map((sig) => (
                        <div
                          key={sig.id}
                          className="relative group text-center"
                        >
                          <img
                            src={sig.image_url || ''}
                            alt={sig.angle_label}
                            className="w-16 h-16 rounded-lg object-cover border border-border"
                          />
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {sig.angle_label}
                          </p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSignature(sig.id, child.id);
                            }}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Delete Student */}
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive text-xs h-7">
                          <Trash2 className="w-3 h-3 mr-1" />
                          Remove Student
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove {child.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will delete all face data and the student record. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteChild(child)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
