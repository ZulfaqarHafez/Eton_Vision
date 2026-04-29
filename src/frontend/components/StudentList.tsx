import { useState, useEffect, useCallback, Suspense, lazy } from 'react';
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
import { toast } from 'sonner';

const StudentEnrolment = lazy(() =>
  import('./StudentEnrolment').then((module) => ({ default: module.StudentEnrolment })),
);
const LiveScanEnrolment = lazy(() =>
  import('./LiveScanEnrolment').then((module) => ({ default: module.LiveScanEnrolment })),
);

function EnrolmentLoadingFallback({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 rounded-xl border border-border/70 bg-background/60 text-xs text-muted-foreground">
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
      {label}
    </div>
  );
}

export function StudentList() {
  const [children, setChildren] = useState<Child[]>([]);
  const [signatures, setSignatures] = useState<Record<string, FaceSignature[]>>({});
  const [loading, setLoading] = useState(true);
  const [enrolDialogOpen, setEnrolDialogOpen] = useState(false);
  const [enrolMode, setEnrolMode] = useState<'upload' | 'livescan'>('upload');
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
    try {
      // 1. Delete all signatures first
      const { error: sigError } = await supabase
        .from('face_signatures')
        .delete()
        .eq('child_id', child.id);
      
      if (sigError) throw sigError;

      // 2. Now delete the student
      const { error: childError } = await supabase
        .from('children')
        .delete()
        .eq('id', child.id);

      if (childError) throw childError;

      toast.success(`${child.name} removed permanently`);
      
      // 3. CRITICAL CHANGE: Manually update the local list so they don't "reappear"
      setChildren(prev => prev.filter(c => c.id !== child.id)); 
      
    } catch (err) {
      console.error('Delete failed:', err);
      toast.error('Could not delete student.');
    }
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

  const handleEnrolDialogChange = (open: boolean) => {
    setEnrolDialogOpen(open);
    if (open) {
      setEnrolMode('upload');
    }
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

        <Dialog open={enrolDialogOpen} onOpenChange={handleEnrolDialogChange}>
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
            <Tabs
              value={enrolMode}
              onValueChange={(value) => setEnrolMode(value as 'upload' | 'livescan')}
              className="w-full"
            >
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
                {enrolMode === 'upload' && (
                  <Suspense fallback={<EnrolmentLoadingFallback label="Loading upload enrolment..." />}>
                    <StudentEnrolment
                      onSuccess={() => {
                        setEnrolDialogOpen(false);
                        fetchStudents();
                      }}
                    />
                  </Suspense>
                )}
              </TabsContent>
              <TabsContent value="livescan" className="mt-4">
                {enrolMode === 'livescan' && (
                  <Suspense fallback={<EnrolmentLoadingFallback label="Loading live scan tools..." />}>
                    <LiveScanEnrolment
                      onSuccess={() => {
                        setEnrolDialogOpen(false);
                        fetchStudents();
                      }}
                    />
                  </Suspense>
                )}
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
